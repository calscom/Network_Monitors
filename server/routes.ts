import type { Express, RequestHandler } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import snmp from "net-snmp";
import { exec } from "child_process";
import { promisify } from "util";
import net from "net";
import dns from "dns";
import { insertDeviceSchema, type UserRole } from "@shared/schema";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";

const dnsPromises = dns.promises;

const execAsync = promisify(exec);

// Check if running on Replit (has REPL_ID environment variable)
const isReplitEnvironment = !!process.env.REPL_ID;

// Middleware that bypasses auth when not on Replit
const conditionalAuth: RequestHandler = (req, res, next) => {
  if (!isReplitEnvironment) {
    // Self-hosted: bypass authentication, treat as admin
    (req as any).user = { claims: { sub: 'self-hosted-admin' } };
    (req as any).dbUser = { id: 'self-hosted-admin', role: 'admin' };
    (req as any).isAuthenticated = () => true;
    return next();
  }
  return isAuthenticated(req, res, next);
};

// Role-based access control middleware
const requireRole = (...allowedRoles: UserRole[]): RequestHandler => {
  return async (req, res, next) => {
    // Self-hosted: always allow (treated as admin)
    if (!isReplitEnvironment) {
      (req as any).dbUser = { id: 'self-hosted-admin', role: 'admin' };
      return next();
    }
    
    const user = req.user as any;
    if (!user?.claims?.sub) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    const dbUser = await authStorage.getUser(user.claims.sub);
    if (!dbUser) {
      return res.status(401).json({ message: "User not found" });
    }
    
    if (!allowedRoles.includes(dbUser.role as UserRole)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    // Attach user to request for downstream use
    (req as any).dbUser = dbUser;
    next();
  };
};

const OID_IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10.1";  // Download (inbound)
const OID_IF_OUT_OCTETS = "1.3.6.1.2.1.2.2.1.16.1"; // Upload (outbound)

// Global polling configuration
let currentPollingInterval = 5000; // Default 5 seconds
let pollingTimeoutId: ReturnType<typeof setTimeout> | null = null;
const POLLING_OPTIONS = [
  { value: 5000, label: "5 sec" },
  { value: 10000, label: "10 sec" },
  { value: 30000, label: "30 sec" },
  { value: 60000, label: "60 sec" },
  { value: 120000, label: "2 min" },
  { value: 300000, label: "5 min" },
]; 

const SITES = [
  "01 Cloud", "02-Maiduguri", "03-Gwoza", "04-Bama", "05-Ngala", 
  "06-Dikwa", "07-Monguno", "08-Damasak", "09-Banki", "10-CN1", 
  "11-CN2", "12-Damboa"
];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up authentication BEFORE other routes
  if (isReplitEnvironment) {
    await setupAuth(app);
  } else {
    console.log("[auth] Self-hosted mode: authentication disabled, all users have admin access");
  }
  
  // Always register auth routes (handles both Replit and self-hosted modes)
  registerAuthRoutes(app);

  // User management endpoints (admin only)
  app.get("/api/users", conditionalAuth, requireRole('admin'), async (req, res) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers);
  });

  app.patch("/api/users/:id/role", conditionalAuth, requireRole('admin'), async (req, res) => {
    const userId = req.params.id;
    const { role } = req.body;
    
    if (!['admin', 'operator', 'viewer'].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    
    const updatedUser = await storage.updateUserRole(userId, role);
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    await storage.createLog({
      deviceId: null,
      site: "System",
      type: 'user_role_changed',
      message: `User ${updatedUser.email || updatedUser.id} role changed to ${role}`
    });
    
    res.json(updatedUser);
  });

  // Read-only routes - any authenticated user can access
  app.get(api.devices.list.path, conditionalAuth, async (req, res) => {
    const devices = await storage.getDevices();
    res.json(devices);
  });

  app.get("/api/logs", conditionalAuth, async (req, res) => {
    const site = req.query.site as string;
    const logs = await storage.getLogs(site);
    res.json(logs);
  });

  // Write operations - operators and admins only
  app.post(api.devices.create.path, conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const input = api.devices.create.input.parse(req.body);
      const device = await storage.createDevice(input);
      
      // Log device creation with details
      await storage.createLog({
        deviceId: device.id,
        site: device.site,
        type: 'device_added',
        message: `New ${device.type} device "${device.name}" added at IP ${device.ip}`
      });
      
      res.status(201).json(device);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.devices.delete.path, conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    const deviceId = Number(req.params.id);
    const devices = await storage.getDevices();
    const device = devices.find(d => d.id === deviceId);
    
    await storage.deleteDevice(deviceId);
    
    // Log device deletion with details
    if (device) {
      await storage.createLog({
        deviceId: null,
        site: device.site,
        type: 'device_removed',
        message: `${device.type} device "${device.name}" (IP: ${device.ip}) was deleted`
      });
    }
    
    res.status(204).send();
  });

  app.patch("/api/devices/:id", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      
      // Get original device for comparison
      const allDevices = await storage.getDevices();
      const originalDevice = allDevices.find(d => d.id === id);
      
      const input = insertDeviceSchema.partial().parse(req.body);
      const device = await storage.updateDevice(id, input);
      
      // Build specific change description
      const changes: string[] = [];
      if (originalDevice) {
        if (input.name && input.name !== originalDevice.name) {
          changes.push(`name: "${originalDevice.name}" → "${input.name}"`);
        }
        if (input.ip && input.ip !== originalDevice.ip) {
          changes.push(`IP: ${originalDevice.ip} → ${input.ip}`);
        }
        if (input.type && input.type !== originalDevice.type) {
          changes.push(`type: ${originalDevice.type} → ${input.type}`);
        }
        if (input.site && input.site !== originalDevice.site) {
          changes.push(`site: "${originalDevice.site}" → "${input.site}"`);
        }
        if (input.community && input.community !== originalDevice.community) {
          changes.push(`SNMP community updated`);
        }
      }
      
      const changeDetail = changes.length > 0 ? changes.join(", ") : "settings modified";
      
      // Log device edit with specific changes
      await storage.createLog({
        deviceId: device.id,
        site: device.site,
        type: 'device_updated',
        message: `Device "${device.name}" updated: ${changeDetail}`
      });
      
      res.json(device);
    } catch (err: any) {
      console.error("Error updating device:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Batch update devices from one site to another
  app.post("/api/devices/reassign-site", async (req, res) => {
    try {
      const { fromSite, toSite } = req.body;
      if (!fromSite || !toSite) {
        return res.status(400).json({ message: "Both fromSite and toSite are required" });
      }
      if (fromSite === toSite) {
        return res.status(400).json({ message: "Source and target sites must be different" });
      }
      const count = await storage.updateDevicesSite(fromSite, toSite);
      if (count === 0) {
        return res.status(404).json({ message: "No devices found in the source site" });
      }
      
      // Log site reassignment
      await storage.createLog({
        deviceId: null,
        site: toSite,
        type: 'devices_reassigned',
        message: `${count} device(s) moved from "${fromSite}" to "${toSite}"`
      });
      
      res.json({ updated: count });
    } catch (err: any) {
      console.error("Error reassigning devices:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  app.get("/api/devices/:id/history", conditionalAuth, async (req, res) => {
    try {
      const deviceId = Number(req.params.id);
      const hours = Number(req.query.hours) || 24;
      
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      
      const history = await storage.getHistoricalMetrics(deviceId, hours);
      const averages = await storage.getHistoricalAverages(deviceId, hours);
      
      res.json({ history, averages });
    } catch (err: any) {
      console.error("Error fetching history:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Polling interval endpoints
  app.get("/api/settings/polling", conditionalAuth, (req, res) => {
    res.json({ 
      interval: currentPollingInterval,
      options: POLLING_OPTIONS
    });
  });

  app.post("/api/settings/polling", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    const { interval } = req.body;
    const validOption = POLLING_OPTIONS.find(opt => opt.value === interval);
    
    if (!validOption) {
      return res.status(400).json({ message: "Invalid polling interval" });
    }
    
    const oldInterval = currentPollingInterval;
    currentPollingInterval = interval;
    
    // Clear the existing timeout to prevent duplicate polling loops
    if (pollingTimeoutId) {
      clearTimeout(pollingTimeoutId);
      pollingTimeoutId = null;
    }
    
    // Log the change
    await storage.createLog({
      deviceId: null,
      site: "System",
      type: 'settings_changed',
      message: `Polling interval changed: ${oldInterval/1000}s → ${interval/1000}s`
    });
    
    // Reschedule polling with new interval
    pollingTimeoutId = setTimeout(async () => {
      const devices = await storage.getDevices();
      const intervalSeconds = currentPollingInterval / 1000;
      await Promise.all(devices.map(device => pollDevice(device, intervalSeconds)));
      pollingTimeoutId = setTimeout(pollDevices, currentPollingInterval);
    }, currentPollingInterval);
    
    res.json({ interval: currentPollingInterval });
  });

  // ============= UTILITY ROUTES (Ping & Traceroute) =============
  
  // Helper: TCP-based ping for environments without raw socket access
  const tcpPing = (host: string, port: number, timeout: number): Promise<{ success: boolean; time: number; error?: string }> => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        const time = Date.now() - startTime;
        socket.destroy();
        resolve({ success: true, time });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: false, time: timeout, error: 'Connection timed out' });
      });
      
      socket.on('error', (err: any) => {
        const time = Date.now() - startTime;
        socket.destroy();
        resolve({ success: false, time, error: err.code || err.message });
      });
      
      socket.connect(port, host);
    });
  };
  
  // Streaming ping utility - real-time output via SSE
  app.get("/api/utility/ping/stream", conditionalAuth, async (req, res) => {
    const target = req.query.target as string;
    const count = parseInt(req.query.count as string) || 4;
    
    if (!target) {
      return res.status(400).json({ message: "Target IP or hostname required" });
    }
    
    const sanitizedTarget = target.replace(/[^a-zA-Z0-9.-]/g, '');
    if (!sanitizedTarget) {
      return res.status(400).json({ message: "Invalid target" });
    }
    const pingCount = Math.min(Math.max(1, count), 10);
    
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    const sendLine = (data: string) => {
      res.write(`data: ${JSON.stringify({ line: data })}\n\n`);
    };
    
    const sendDone = (success: boolean) => {
      res.write(`data: ${JSON.stringify({ done: true, success })}\n\n`);
      res.end();
    };
    
    // Try ICMP ping first with spawn for streaming
    const { spawn } = await import('child_process');
    const pingProcess = spawn('ping', ['-c', pingCount.toString(), '-W', '2', sanitizedTarget]);
    
    let hasOutput = false;
    let isPermissionError = false;
    
    pingProcess.stdout.on('data', (data) => {
      hasOutput = true;
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      lines.forEach((line: string) => sendLine(line));
    });
    
    pingProcess.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      if (errorMsg.includes('Operation not permitted') || 
          errorMsg.includes('cap_net_raw') ||
          errorMsg.includes('setuid')) {
        isPermissionError = true;
      } else {
        sendLine(`Error: ${errorMsg.trim()}`);
      }
    });
    
    pingProcess.on('close', async (code) => {
      if (isPermissionError) {
        // Fall back to TCP ping with streaming
        sendLine('[ICMP not available, using TCP connectivity check]');
        
        try {
          let resolvedIp = sanitizedTarget;
          
          try {
            const addresses = await dnsPromises.resolve4(sanitizedTarget);
            if (addresses.length > 0) {
              resolvedIp = addresses[0];
              sendLine(`Resolved ${sanitizedTarget} to ${resolvedIp}`);
            }
          } catch (dnsError: any) {
            if (!sanitizedTarget.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
              sendLine(`Error: Could not resolve hostname: ${sanitizedTarget}`);
              sendDone(false);
              return;
            }
          }
          
          // Find open port
          const portsToTry = [80, 443, 22, 161];
          let successfulPort = 0;
          
          for (const port of portsToTry) {
            const result = await tcpPing(resolvedIp, port, 2000);
            if (result.success) {
              successfulPort = port;
              break;
            }
          }
          
          const port = successfulPort || 80;
          sendLine(`TCP PING ${resolvedIp}:${port} (${pingCount} attempts)`);
          sendLine('---');
          
          let successCount = 0;
          let totalTime = 0;
          let minTime = Infinity;
          let maxTime = 0;
          
          for (let i = 0; i < pingCount; i++) {
            const result = await tcpPing(resolvedIp, port, 3000);
            
            if (result.success) {
              successCount++;
              totalTime += result.time;
              minTime = Math.min(minTime, result.time);
              maxTime = Math.max(maxTime, result.time);
              sendLine(`tcp_seq=${i + 1} port=${port} time=${result.time} ms`);
            } else {
              sendLine(`tcp_seq=${i + 1} port=${port} ${result.error || 'Connection failed'}`);
            }
            
            if (i < pingCount - 1) {
              await new Promise(r => setTimeout(r, 200));
            }
          }
          
          sendLine('---');
          const lossPercent = ((pingCount - successCount) / pingCount * 100).toFixed(1);
          sendLine(`${pingCount} packets transmitted, ${successCount} received, ${lossPercent}% packet loss`);
          
          if (successCount > 0) {
            const avgTime = (totalTime / successCount).toFixed(2);
            sendLine(`rtt min/avg/max = ${minTime}/${avgTime}/${maxTime} ms`);
          }
          
          sendDone(successCount > 0);
        } catch (err: any) {
          sendLine(`Error: ${err.message}`);
          sendDone(false);
        }
      } else {
        sendDone(code === 0);
      }
    });
    
    pingProcess.on('error', (err) => {
      sendLine(`Error: ${err.message}`);
      sendDone(false);
    });
    
    req.on('close', () => {
      pingProcess.kill();
    });
  });
  
  // Streaming traceroute utility - real-time output via SSE
  app.get("/api/utility/traceroute/stream", conditionalAuth, async (req, res) => {
    const target = req.query.target as string;
    
    if (!target) {
      return res.status(400).json({ message: "Target IP or hostname required" });
    }
    
    const sanitizedTarget = target.replace(/[^a-zA-Z0-9.-]/g, '');
    if (!sanitizedTarget) {
      return res.status(400).json({ message: "Invalid target" });
    }
    
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    const sendLine = (data: string) => {
      res.write(`data: ${JSON.stringify({ line: data })}\n\n`);
    };
    
    const sendDone = (success: boolean) => {
      res.write(`data: ${JSON.stringify({ done: true, success })}\n\n`);
      res.end();
    };
    
    const { spawn } = await import('child_process');
    const traceProcess = spawn('traceroute', ['-m', '15', '-w', '2', sanitizedTarget]);
    
    traceProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      lines.forEach((line: string) => sendLine(line));
    });
    
    traceProcess.stderr.on('data', (data) => {
      sendLine(`Error: ${data.toString().trim()}`);
    });
    
    traceProcess.on('close', (code) => {
      sendDone(code === 0);
    });
    
    traceProcess.on('error', (err) => {
      sendLine(`Error: ${err.message}`);
      sendDone(false);
    });
    
    req.on('close', () => {
      traceProcess.kill();
    });
  });

  app.get("/api/devices/template", conditionalAuth, async (req, res) => {
    const devices = await storage.getDevices();
    const headers = ["name", "ip", "community", "type", "site"];
    
    let csvContent = headers.join(",") + "\n";
    
    for (const device of devices) {
      const row = [
        `"${device.name}"`,
        `"${device.ip}"`,
        `"public"`,
        `"${device.type}"`,
        `"${device.site}"`
      ];
      csvContent += row.join(",") + "\n";
    }
    
    if (devices.length === 0) {
      csvContent += '"Example Device","192.168.1.1","public","mikrotik","01 Cloud"\n';
    }
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=devices_template.csv");
    res.send(csvContent);
  });

  // Helper function to poll a single device (returns a Promise)
  const pollDevice = (device: any, intervalSeconds: number): Promise<void> => {
    return new Promise((resolve) => {
      const session = snmp.createSession(device.ip, device.community, {
        timeout: 2000,
        retries: 1
      });

      console.log(`[snmp] Polling ${device.name} at ${device.ip} (interval: ${intervalSeconds}s)...`);

      session.get([OID_IF_IN_OCTETS, OID_IF_OUT_OCTETS], async (error, varbinds) => {
        let newStatus = 'red';
        let newUtilization = device.utilization;
        let bandwidthMBps = device.bandwidthMBps;
        let downloadMbps = device.downloadMbps;
        let uploadMbps = device.uploadMbps;
        let lastInCounter = device.lastInCounter;
        let lastOutCounter = device.lastOutCounter;

        if (!error && varbinds.length >= 2 && !snmp.isVarbindError(varbinds[0]) && !snmp.isVarbindError(varbinds[1])) {
          const currentInCounter = BigInt(varbinds[0].value);
          const currentOutCounter = BigInt(varbinds[1].value);
          console.log(`[snmp] Response from ${device.name}: IN=${currentInCounter}, OUT=${currentOutCounter}`);
          
          if (device.status === 'red') {
            newStatus = 'blue';
          } else {
            newStatus = 'green';
          }

          // Calculate download speed (Mbps) from inbound octets using actual interval
          if (lastInCounter > BigInt(0) && currentInCounter >= lastInCounter) {
            const deltaBytes = Number(currentInCounter - lastInCounter);
            const mbpsValue = (deltaBytes * 8) / (intervalSeconds * 1000 * 1000);
            downloadMbps = mbpsValue.toFixed(2);
          } else {
            downloadMbps = "0.00";
          }

          // Calculate upload speed (Mbps) from outbound octets using actual interval
          if (lastOutCounter > BigInt(0) && currentOutCounter >= lastOutCounter) {
            const deltaBytes = Number(currentOutCounter - lastOutCounter);
            const mbpsValue = (deltaBytes * 8) / (intervalSeconds * 1000 * 1000);
            uploadMbps = mbpsValue.toFixed(2);
          } else {
            uploadMbps = "0.00";
          }

          // Total bandwidth in Mbps (combined download + upload)
          const totalMbps = parseFloat(downloadMbps) + parseFloat(uploadMbps);
          bandwidthMBps = totalMbps.toFixed(2);
          
          // Utilization based on total throughput vs 1Gbps link
          newUtilization = Math.min(100, Math.floor((totalMbps / 1000) * 100));

          lastInCounter = currentInCounter;
          lastOutCounter = currentOutCounter;
        } else {
          console.error(`[snmp] Error polling ${device.name}: ${error?.message || 'Unknown error'}`);
          newStatus = 'red';
          bandwidthMBps = "0.00";
          downloadMbps = "0.00";
          uploadMbps = "0.00";
          newUtilization = 0;
        }

        // Real SNMP data only - no simulation

        if (device.status !== newStatus) {
          console.log(`[snmp] Status change for ${device.name}: ${device.status} -> ${newStatus}`);
          
          // Map status codes to readable labels
          const statusLabels: Record<string, string> = {
            'green': 'Online',
            'red': 'Offline',
            'blue': 'Recovering',
            'unknown': 'Unknown'
          };
          const oldLabel = statusLabels[device.status] || device.status;
          const newLabel = statusLabels[newStatus] || newStatus;
          
          await storage.createLog({
            deviceId: device.id,
            site: device.site,
            type: 'status_change',
            message: `${device.name} status changed: ${oldLabel} → ${newLabel}`
          });
        }

        // Track availability: increment totalChecks, and successfulChecks on success
        const isSuccess = newStatus === 'green' || newStatus === 'blue';
        
        await storage.updateDeviceMetrics(device.id, {
          status: newStatus,
          utilization: newUtilization,
          bandwidthMBps,
          downloadMbps,
          uploadMbps,
          lastInCounter,
          lastOutCounter,
          totalChecks: device.totalChecks + 1,
          successfulChecks: isSuccess ? device.successfulChecks + 1 : device.successfulChecks
        });

        // Save metrics snapshot for historical tracking (only when device is online)
        if (newStatus === 'green') {
          await storage.saveMetricsSnapshot({
            deviceId: device.id,
            site: device.site,
            utilization: newUtilization,
            bandwidthMBps,
            downloadMbps,
            uploadMbps
          });
        }
        
        session.close();
        resolve();
      });
    });
  };

  // Background polling service with dynamic interval
  const pollDevices = async () => {
    const devices = await storage.getDevices();
    const intervalSeconds = currentPollingInterval / 1000;
    
    // Poll all devices in parallel and wait for all to complete
    await Promise.all(devices.map(device => pollDevice(device, intervalSeconds)));
    
    // Schedule next poll with current interval (only after all devices complete)
    pollingTimeoutId = setTimeout(pollDevices, currentPollingInterval);
  };
  
  // Start polling
  pollingTimeoutId = setTimeout(pollDevices, currentPollingInterval);

  // Seed data with 12 sites
  const existing = await storage.getDevices();
  if (existing.length === 0) {
    for (const siteName of SITES) {
      await storage.createDevice({
        name: `${siteName} Gateway`,
        ip: `10.0.0.${SITES.indexOf(siteName) + 1}`,
        community: "public",
        type: siteName.toLowerCase().includes('cloud') ? 'generic' : 'mikrotik',
        site: siteName
      });
    }
  }

  return httpServer;
}
