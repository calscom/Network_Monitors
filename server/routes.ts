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
import { insertDeviceSchema, type UserRole, insertNotificationSettingsSchema } from "@shared/schema";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";
import { testTelegramConnection, notifyDeviceOffline, notifyDeviceRecovery, notifyHighUtilization } from "./notifications";

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

// Base OIDs without interface index suffix (interface index is appended dynamically)
const OID_IF_IN_OCTETS_BASE = "1.3.6.1.2.1.2.2.1.10";  // Download (inbound)
const OID_IF_OUT_OCTETS_BASE = "1.3.6.1.2.1.2.2.1.16"; // Upload (outbound)
// OIDs for interface discovery
const OID_IF_DESCR = "1.3.6.1.2.1.2.2.1.2";     // Interface description
const OID_IF_TYPE = "1.3.6.1.2.1.2.2.1.3";      // Interface type
const OID_IF_SPEED = "1.3.6.1.2.1.2.2.1.5";     // Interface speed
const OID_IF_ADMIN_STATUS = "1.3.6.1.2.1.2.2.1.7"; // Admin status
const OID_IF_OPER_STATUS = "1.3.6.1.2.1.2.2.1.8";  // Operational status
const OID_IF_ALIAS = "1.3.6.1.2.1.31.1.1.1.18";    // Interface alias (IF-MIB)

// Mikrotik Hotspot/UserManager OIDs
const OID_MIKROTIK_HOTSPOT_ACTIVE_USERS = "1.3.6.1.4.1.14988.1.1.5.1.1.1"; // MikroTik native hotspot active users table
const OID_AAA_SESSIONS = "1.3.6.1.4.1.9.9.150.1.1.1.0"; // Cisco AAA sessions (also works on Mikrotik)

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
      
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      
      // Support custom date range or hours-back
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      let hours = 24;
      
      if (req.query.start && req.query.end) {
        startDate = new Date(req.query.start as string);
        endDate = new Date(req.query.end as string);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        hours = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
      } else {
        hours = Number(req.query.hours) || 24;
      }
      
      const history = await storage.getHistoricalMetrics(deviceId, hours, startDate, endDate);
      const averages = await storage.getHistoricalAverages(deviceId, hours, startDate, endDate);
      
      res.json({ history, averages });
    } catch (err: any) {
      console.error("Error fetching history:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Get interface metrics history for graphing
  app.get("/api/interfaces/:id/history", conditionalAuth, async (req, res) => {
    try {
      const interfaceId = Number(req.params.id);
      
      if (isNaN(interfaceId)) {
        return res.status(400).json({ message: "Invalid interface ID" });
      }
      
      // Support custom date range or hours-back
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      let hours = 24;
      
      if (req.query.start && req.query.end) {
        startDate = new Date(req.query.start as string);
        endDate = new Date(req.query.end as string);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        hours = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
      } else {
        hours = Number(req.query.hours) || 24;
      }
      
      const history = await storage.getInterfaceHistoricalMetrics(interfaceId, hours, startDate, endDate);
      
      // Return array directly for frontend compatibility
      res.json(history);
    } catch (err: any) {
      console.error("Error fetching interface history:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Compare device performance between two time periods
  app.get("/api/devices/:id/compare", conditionalAuth, async (req, res) => {
    try {
      const deviceId = Number(req.params.id);
      
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      
      // Get comparison period type (e.g., "day", "week", "month")
      const periodType = (req.query.period as string) || "day";
      
      // Calculate current and previous periods based on type
      const now = new Date();
      let currentStart: Date;
      let currentEnd: Date = now;
      let previousStart: Date;
      let previousEnd: Date;
      
      switch (periodType) {
        case "day":
          // Compare today vs yesterday
          currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          previousEnd = new Date(currentStart);
          previousStart = new Date(previousEnd.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "week":
          // Compare this week vs last week
          currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          previousEnd = new Date(currentStart);
          previousStart = new Date(previousEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          // Compare this month vs last month
          currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          previousEnd = new Date(currentStart);
          previousStart = new Date(previousEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          previousEnd = new Date(currentStart);
          previousStart = new Date(previousEnd.getTime() - 24 * 60 * 60 * 1000);
      }
      
      const hoursBack = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60));
      
      // Fetch data for both periods in parallel
      const [currentData, previousData, currentAvgResult, previousAvgResult] = await Promise.all([
        storage.getHistoricalMetrics(deviceId, hoursBack, currentStart, currentEnd),
        storage.getHistoricalMetrics(deviceId, hoursBack, previousStart, previousEnd),
        storage.getHistoricalAverages(deviceId, hoursBack, currentStart, currentEnd),
        storage.getHistoricalAverages(deviceId, hoursBack, previousStart, previousEnd)
      ]);
      
      // Ensure averages have default values if no data exists
      const defaultAvg = { avgUtilization: 0, avgBandwidth: 0 };
      const currentAvg = currentAvgResult || defaultAvg;
      const previousAvg = previousAvgResult || defaultAvg;
      
      // Calculate percentage changes (only if previous period has data)
      const utilizationChange = previousAvg.avgUtilization > 0 
        ? ((currentAvg.avgUtilization - previousAvg.avgUtilization) / previousAvg.avgUtilization) * 100 
        : 0;
      const bandwidthChange = previousAvg.avgBandwidth > 0 
        ? ((currentAvg.avgBandwidth - previousAvg.avgBandwidth) / previousAvg.avgBandwidth) * 100 
        : 0;
      
      res.json({
        current: {
          period: { start: currentStart, end: currentEnd },
          data: currentData || [],
          averages: currentAvg
        },
        previous: {
          period: { start: previousStart, end: previousEnd },
          data: previousData || [],
          averages: previousAvg
        },
        changes: {
          utilization: Math.round(utilizationChange * 10) / 10,
          bandwidth: Math.round(bandwidthChange * 10) / 10
        }
      });
    } catch (err: any) {
      console.error("Error fetching comparison data:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Get monitored interfaces for a device
  app.get("/api/devices/:id/monitored-interfaces", conditionalAuth, async (req, res) => {
    try {
      const deviceId = Number(req.params.id);
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      const interfaces = await storage.getDeviceInterfaces(deviceId);
      res.json(interfaces);
    } catch (err: any) {
      console.error("Error fetching monitored interfaces:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Set monitored interfaces for a device
  app.post("/api/devices/:id/monitored-interfaces", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const deviceId = Number(req.params.id);
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      
      const { interfaces } = req.body;
      if (!Array.isArray(interfaces)) {
        return res.status(400).json({ message: "interfaces must be an array" });
      }

      // Prepare interfaces with deviceId - handle both old and new field names
      const interfacesToSave = interfaces.map((iface: any, idx: number) => ({
        deviceId,
        interfaceIndex: iface.interfaceIndex ?? iface.index ?? 1,
        interfaceName: iface.interfaceName ?? iface.name ?? `Interface ${iface.interfaceIndex || iface.index || 1}`,
        isPrimary: typeof iface.isPrimary === 'number' 
          ? iface.isPrimary 
          : (iface.isPrimary === true ? 1 : (idx === 0 ? 1 : 0)),
      }));

      console.log(`[interfaces] Saving ${interfacesToSave.length} interfaces for device ${deviceId}:`, 
        interfacesToSave.map(i => `${i.interfaceName} (idx:${i.interfaceIndex}, primary:${i.isPrimary})`).join(', '));

      const savedInterfaces = await storage.setDeviceInterfaces(deviceId, interfacesToSave);
      
      // Also update the device's primary interface
      const primaryInterface = savedInterfaces.find(i => i.isPrimary === 1);
      if (primaryInterface) {
        await storage.updateDevice(deviceId, {
          interfaceIndex: primaryInterface.interfaceIndex,
          interfaceName: primaryInterface.interfaceName,
        });
      }

      res.json(savedInterfaces);
    } catch (err: any) {
      console.error("Error setting monitored interfaces:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // SNMP Interface Discovery endpoint
  app.get("/api/devices/:id/interfaces", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const deviceId = Number(req.params.id);
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }

      const devices = await storage.getDevices();
      const device = devices.find(d => d.id === deviceId);
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }

      const interfaces: Array<{
        index: number;
        name: string;
        type: number;
        speed: number;
        adminStatus: number;
        operStatus: number;
      }> = [];

      const session = snmp.createSession(device.ip, device.community, {
        timeout: 5000,
        retries: 1
      });

      // Walk the interface description OID to discover all interfaces
      session.subtree(OID_IF_DESCR, 20, (varbinds) => {
        for (const varbind of varbinds) {
          if (!snmp.isVarbindError(varbind)) {
            const oid = varbind.oid.toString();
            const index = parseInt(oid.split('.').pop() || '0');
            const name = varbind.value?.toString() || `Interface ${index}`;
            
            interfaces.push({
              index,
              name,
              type: 0,
              speed: 0,
              adminStatus: 0,
              operStatus: 0
            });
          }
        }
      }, (error) => {
        session.close();
        
        if (error && interfaces.length === 0) {
          console.error(`[snmp] Interface discovery failed for ${device.name}: ${error.message}`);
          return res.status(500).json({ 
            message: `SNMP discovery failed: ${error.message}`,
            interfaces: [] 
          });
        }

        // Sort by interface index
        interfaces.sort((a, b) => a.index - b.index);
        
        console.log(`[snmp] Discovered ${interfaces.length} interfaces on ${device.name}`);
        res.json({ 
          deviceId: device.id,
          deviceName: device.name,
          currentInterface: device.interfaceIndex || 1,
          interfaces 
        });
      });

    } catch (err: any) {
      console.error("Error discovering interfaces:", err);
      res.status(500).json({ message: err.message || "Interface discovery failed" });
    }
  });

  // Direct interface discovery by IP/community (for new devices before they're added)
  app.post("/api/discover-interfaces", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const { ip, community } = req.body;
      
      if (!ip || !community) {
        return res.status(400).json({ message: "IP address and community string are required" });
      }

      // Validate IP format
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(ip)) {
        return res.status(400).json({ message: "Invalid IP address format" });
      }

      const interfaces: Array<{
        index: number;
        name: string;
        type: number;
        speed: number;
        adminStatus: number;
        operStatus: number;
        isUplink: boolean;
      }> = [];

      const session = snmp.createSession(ip, community, {
        timeout: 5000,
        retries: 1
      });

      // Walk the interface description OID
      session.subtree(OID_IF_DESCR, 20, (varbinds) => {
        for (const varbind of varbinds) {
          if (!snmp.isVarbindError(varbind)) {
            const oid = varbind.oid.toString();
            const index = parseInt(oid.split('.').pop() || '0');
            const name = varbind.value?.toString() || `Interface ${index}`;
            
            // Heuristic to identify uplink interfaces
            const nameLower = name.toLowerCase();
            const isUplink = nameLower.includes('wan') || 
                           nameLower.includes('uplink') || 
                           nameLower.includes('ether1') ||
                           nameLower.includes('sfp') ||
                           nameLower.includes('fiber') ||
                           nameLower.includes('eth0') ||
                           nameLower.includes('internet') ||
                           nameLower.includes('outside');
            
            interfaces.push({
              index,
              name,
              type: 0,
              speed: 0,
              adminStatus: 0,
              operStatus: 0,
              isUplink
            });
          }
        }
      }, (error) => {
        session.close();
        
        if (error && interfaces.length === 0) {
          console.error(`[snmp] Interface discovery failed for ${ip}: ${error.message}`);
          return res.status(500).json({ 
            message: `SNMP discovery failed: ${error.message}`,
            interfaces: [] 
          });
        }

        // Sort by interface index
        interfaces.sort((a, b) => a.index - b.index);
        
        // Find the best uplink candidate
        const uplinkInterface = interfaces.find(i => i.isUplink) || interfaces[0];
        const suggestedIndex = uplinkInterface?.index || 1;
        
        console.log(`[snmp] Discovered ${interfaces.length} interfaces on ${ip}, suggested uplink: ${suggestedIndex}`);
        res.json({ 
          ip,
          suggestedInterface: suggestedIndex,
          interfaces 
        });
      });

    } catch (err: any) {
      console.error("Error discovering interfaces:", err);
      res.status(500).json({ message: err.message || "Interface discovery failed" });
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
    
    // Persist to database for restart persistence
    try {
      await storage.savePollingInterval(interval);
    } catch (err) {
      console.error('[settings] Failed to persist polling interval:', err);
    }
    
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

  // ============= NOTIFICATION SETTINGS ROUTES =============
  
  app.get("/api/settings/notifications", conditionalAuth, requireRole('admin'), async (req, res) => {
    try {
      const settings = await storage.getNotificationSettings();
      if (!settings) {
        return res.json({
          emailEnabled: 0,
          emailRecipients: '',
          telegramEnabled: 0,
          telegramBotToken: '',
          telegramChatId: '',
          notifyOnOffline: 1,
          notifyOnRecovery: 1,
          notifyOnHighUtilization: 0,
          utilizationThreshold: 90,
          cooldownMinutes: 5,
        });
      }
      res.json(settings);
    } catch (err: any) {
      console.error('Error fetching notification settings:', err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/settings/notifications", conditionalAuth, requireRole('admin'), async (req, res) => {
    try {
      const parsed = insertNotificationSettingsSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      
      const settings = await storage.saveNotificationSettings(parsed.data);
      
      await storage.createLog({
        deviceId: null,
        site: "System",
        type: 'settings_changed',
        message: 'Notification settings updated'
      });
      
      res.json(settings);
    } catch (err: any) {
      console.error('Error saving notification settings:', err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/settings/notifications/test-telegram", conditionalAuth, requireRole('admin'), async (req, res) => {
    try {
      const { botToken, chatId } = req.body;
      
      if (!botToken || !chatId) {
        return res.status(400).json({ message: 'Bot token and chat ID are required' });
      }
      
      const result = await testTelegramConnection(botToken, chatId);
      res.json(result);
    } catch (err: any) {
      console.error('Error testing Telegram:', err);
      res.status(500).json({ success: false, message: err.message });
    }
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

  // Helper function to poll Mikrotik hotspot active users
  const pollMikrotikActiveUsers = (ip: string, community: string): Promise<number> => {
    return new Promise((resolve) => {
      const session = snmp.createSession(ip, community, {
        timeout: 2000,
        retries: 1
      });

      let userCount = 0;

      // First try the AAA sessions OID (direct count)
      session.get([OID_AAA_SESSIONS], (error, varbinds) => {
        if (!error && varbinds.length > 0 && !snmp.isVarbindError(varbinds[0])) {
          userCount = parseInt(String(varbinds[0].value), 10) || 0;
          console.log(`[snmp] Hotspot users for ${ip}: ${userCount} (AAA sessions)`);
          session.close();
          resolve(userCount);
        } else {
          // Fallback: count entries in MikroTik hotspot table using subtree walk
          session.subtree(OID_MIKROTIK_HOTSPOT_ACTIVE_USERS, 20, (varbinds) => {
            userCount += varbinds.length;
          }, (err) => {
            if (!err) {
              console.log(`[snmp] Hotspot users for ${ip}: ${userCount} (table walk)`);
            }
            session.close();
            resolve(userCount);
          });
        }
      });
    });
  };

  // Helper function to poll a single device (returns a Promise)
  const pollDevice = (device: any, intervalSeconds: number): Promise<void> => {
    return new Promise((resolve) => {
      const session = snmp.createSession(device.ip, device.community, {
        timeout: 2000,
        retries: 1
      });

      // Use device's configured interface index (default to 1)
      const ifIndex = device.interfaceIndex || 1;
      const OID_IF_IN_OCTETS = `${OID_IF_IN_OCTETS_BASE}.${ifIndex}`;
      const OID_IF_OUT_OCTETS = `${OID_IF_OUT_OCTETS_BASE}.${ifIndex}`;

      console.log(`[snmp] Polling ${device.name} at ${device.ip} interface ${ifIndex} (interval: ${intervalSeconds}s)...`);

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
          
          if (newStatus === 'red' && device.status !== 'red') {
            notifyDeviceOffline(device).catch(err => 
              console.error('[notifications] Failed to send offline notification:', err)
            );
          } else if ((newStatus === 'green' || newStatus === 'blue') && device.status === 'red') {
            notifyDeviceRecovery(device).catch(err => 
              console.error('[notifications] Failed to send recovery notification:', err)
            );
          }
        }

        // Track availability: increment totalChecks, and successfulChecks on success
        const isSuccess = newStatus === 'green' || newStatus === 'blue';
        
        // Poll active users for Mikrotik devices (preserve last known value on failure)
        let activeUsers = device.activeUsers || 0;
        if (device.type === 'mikrotik' && isSuccess) {
          try {
            const polledUsers = await pollMikrotikActiveUsers(device.ip, device.community);
            activeUsers = polledUsers; // Only update if poll succeeds
          } catch (err) {
            console.log(`[snmp] Could not poll hotspot users for ${device.name}: ${err}`);
            // Keep the existing activeUsers value (already set above)
          }
        }
        // If device is offline, preserve the last known user count (don't reset to 0)
        
        await storage.updateDeviceMetrics(device.id, {
          status: newStatus,
          utilization: newUtilization,
          bandwidthMBps,
          downloadMbps,
          uploadMbps,
          lastInCounter,
          lastOutCounter,
          totalChecks: device.totalChecks + 1,
          successfulChecks: isSuccess ? device.successfulChecks + 1 : device.successfulChecks,
          activeUsers
        });

        if (isSuccess && newUtilization >= 90) {
          notifyHighUtilization({ ...device, utilization: newUtilization }, newUtilization).catch(err => 
            console.error('[notifications] Failed to send high utilization notification:', err)
          );
        }

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

        // Poll additional monitored interfaces (secondary interfaces)
        const monitoredInterfaces = await storage.getDeviceInterfaces(device.id);
        const secondaryInterfaces = monitoredInterfaces.filter(i => i.isPrimary !== 1);
        
        for (const iface of secondaryInterfaces) {
          await pollSecondaryInterface(device, iface, intervalSeconds);
        }
        
        resolve();
      });
    });
  };

  // Helper function to poll a secondary interface
  const pollSecondaryInterface = (device: any, iface: any, intervalSeconds: number): Promise<void> => {
    return new Promise((resolve) => {
      const session = snmp.createSession(device.ip, device.community, {
        timeout: 2000,
        retries: 1
      });

      const ifIndex = iface.interfaceIndex;
      const OID_IF_IN = `${OID_IF_IN_OCTETS_BASE}.${ifIndex}`;
      const OID_IF_OUT = `${OID_IF_OUT_OCTETS_BASE}.${ifIndex}`;

      session.get([OID_IF_IN, OID_IF_OUT], async (error, varbinds) => {
        let ifaceStatus = 'red';
        let ifaceUtilization = 0;
        let ifaceDownload = "0.00";
        let ifaceUpload = "0.00";
        let ifaceLastIn = iface.lastInCounter;
        let ifaceLastOut = iface.lastOutCounter;

        if (!error && varbinds.length >= 2 && !snmp.isVarbindError(varbinds[0]) && !snmp.isVarbindError(varbinds[1])) {
          const currentIn = BigInt(varbinds[0].value);
          const currentOut = BigInt(varbinds[1].value);
          ifaceStatus = 'green';

          if (ifaceLastIn > BigInt(0) && currentIn >= ifaceLastIn) {
            const deltaBytes = Number(currentIn - ifaceLastIn);
            ifaceDownload = ((deltaBytes * 8) / (intervalSeconds * 1000 * 1000)).toFixed(2);
          }
          if (ifaceLastOut > BigInt(0) && currentOut >= ifaceLastOut) {
            const deltaBytes = Number(currentOut - ifaceLastOut);
            ifaceUpload = ((deltaBytes * 8) / (intervalSeconds * 1000 * 1000)).toFixed(2);
          }

          const totalMbps = parseFloat(ifaceDownload) + parseFloat(ifaceUpload);
          ifaceUtilization = Math.min(100, Math.floor((totalMbps / 1000) * 100));
          ifaceLastIn = currentIn;
          ifaceLastOut = currentOut;
        }

        await storage.updateDeviceInterfaceMetrics(iface.id, {
          status: ifaceStatus,
          utilization: ifaceUtilization,
          downloadMbps: ifaceDownload,
          uploadMbps: ifaceUpload,
          lastInCounter: ifaceLastIn,
          lastOutCounter: ifaceLastOut,
        });

        // Save interface metrics snapshot for historical graphing
        try {
          await storage.saveInterfaceMetricsSnapshot({
            interfaceId: iface.id,
            deviceId: device.id,
            site: device.site,
            interfaceName: iface.interfaceName,
            utilization: ifaceUtilization,
            downloadMbps: ifaceDownload,
            uploadMbps: ifaceUpload,
          });
        } catch (historyErr) {
          console.error(`[snmp] Error saving interface history for interface ${iface.id}:`, historyErr);
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
  
  // Load persisted polling interval from database on startup
  try {
    const appSettingsData = await storage.getAppSettings();
    if (appSettingsData && appSettingsData.pollingIntervalMs) {
      currentPollingInterval = appSettingsData.pollingIntervalMs;
      console.log(`[settings] Loaded persisted polling interval: ${currentPollingInterval}ms`);
    } else {
      console.log(`[settings] Using default polling interval: ${currentPollingInterval}ms`);
    }
  } catch (err) {
    console.error('[settings] Failed to load polling interval, using default:', err);
  }
  
  // Start polling
  pollingTimeoutId = setTimeout(pollDevices, currentPollingInterval);

  return httpServer;
}
