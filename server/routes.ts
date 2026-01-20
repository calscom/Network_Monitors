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
import { insertDeviceSchema, type UserRole, insertNotificationSettingsSchema, userSessions, dailyUserStats } from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage, getSession } from "./replit_integrations/auth";
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
let isAvailabilityResetInProgress = false; // Flag to pause polling during monthly reset
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
    // Self-hosted: Add session middleware for local authentication
    app.set("trust proxy", 1);
    app.use(getSession());
    console.log("[auth] Self-hosted mode: using local username/password authentication");
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

  // Lightweight HTML-only kiosk page for low-memory devices (Raspberry Pi)
  // No React, no heavy JavaScript - just plain HTML with auto-refresh
  app.get("/kiosk-lite", async (req, res) => {
    try {
      console.log("[kiosk-lite] Loading devices and sites...");
      const devices = await storage.getDevices();
      console.log(`[kiosk-lite] Loaded ${devices.length} devices`);
      const sites = await storage.getSites();
      console.log(`[kiosk-lite] Loaded ${sites.length} sites`);
      
      // Calculate stats
      const total = devices.length;
      const online = devices.filter(d => d.status === "green").length;
      const critical = devices.filter(d => d.status === "red" || d.status === "blue").length;
      const activeUsers = devices.reduce((sum, d) => sum + (d.activeUsers || 0), 0);
      
      // Group devices by site
      const devicesBySite: Record<string, typeof devices> = {};
      const siteOrder = sites.map(s => s.name);
      
      for (const site of siteOrder) {
        devicesBySite[site] = devices.filter(d => d.site === site);
      }
      
      // Generate HTML
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="30">
  <title>Network Monitor - Kiosk</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      height: 100vh;
      overflow: hidden;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      display: flex;
      flex-direction: column;
      padding: 0.5vh 0.5vw;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5vw;
      margin-bottom: 0.5vh;
      flex-shrink: 0;
      height: 6vh;
    }
    .stat-card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 0.3vw;
      padding: 0.3vh 0.5vw;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .stat-label {
      font-size: clamp(8px, 1vw, 14px);
      text-transform: uppercase;
      color: #888;
    }
    .stat-value {
      font-size: clamp(16px, 2.5vw, 36px);
      font-weight: bold;
    }
    .stat-value.green { color: #22c55e; }
    .stat-value.red { color: #ef4444; }
    .stat-value.blue { color: #3b82f6; }
    .stat-value.primary { color: #6366f1; }
    
    .sites-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
      gap: 0.5vw;
      flex: 1;
      overflow: hidden;
    }
    .site-card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 0.3vw;
      padding: 0.4vw;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .site-header {
      font-size: clamp(10px, 1.2vw, 16px);
      font-weight: bold;
      color: #fff;
      padding-bottom: 0.3vh;
      border-bottom: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .site-status {
      font-size: clamp(8px, 0.9vw, 12px);
      color: #888;
    }
    .devices-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(50px, 100%), 1fr));
      gap: 0.3vw;
      flex: 1;
      align-content: start;
      padding-top: 0.3vh;
    }
    .devices-grid.cols-5 {
      grid-template-columns: repeat(5, 1fr);
    }
    .device {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 0.2vw;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: clamp(6px, 0.7vw, 10px);
      font-weight: 500;
      text-align: center;
      padding: 0.1vw;
      word-break: break-all;
      overflow: hidden;
    }
    .device.green { background: #166534; color: #bbf7d0; }
    .device.red { background: #991b1b; color: #fecaca; }
    .device.blue { background: #1e40af; color: #bfdbfe; }
    .device.gray { background: #374151; color: #9ca3af; }
    
    .footer {
      flex-shrink: 0;
      height: 8vh;
      background: #1a1a1a;
      margin: 0.5vh -0.5vw -0.5vh -0.5vw;
      padding: 0 2vw;
      font-size: 55px;
      font-weight: bold;
      color: #fff;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 2px solid #333;
    }
    .legend {
      display: flex;
      gap: 3vw;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 1vw;
    }
    .legend-dot {
      width: 4vh;
      height: 4vh;
      border-radius: 0.5vh;
    }
    .legend-dot.green { background: #22c55e; }
    .legend-dot.blue { background: #3b82f6; }
    .legend-dot.red { background: #ef4444; }
    .footer-time {
      font-size: 40px;
      color: #aaa;
    }
  </style>
</head>
<body>
  <div class="stats">
    <div class="stat-card">
      <div class="stat-label">Total Devices</div>
      <div class="stat-value primary">${total}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Online & Stable</div>
      <div class="stat-value green">${online}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Critical / Recovering</div>
      <div class="stat-value red">${critical}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Active Users</div>
      <div class="stat-value blue">${activeUsers}</div>
    </div>
  </div>
  
  <div class="sites-grid">
    ${siteOrder.map(site => {
      const siteDevices = devicesBySite[site] || [];
      const up = siteDevices.filter(d => d.status === "green").length;
      const down = siteDevices.filter(d => d.status === "red" || d.status === "blue").length;
      
      // Sort: green first, then blue, then red
      const sorted = [...siteDevices].sort((a, b) => {
        const order: Record<string, number> = { green: 0, blue: 1, red: 2, gray: 3 };
        return (order[a.status || 'gray'] || 3) - (order[b.status || 'gray'] || 3);
      });
      
      const isMaiduguri = site.toLowerCase().includes('maiduguri');
      return `
        <div class="site-card">
          <div class="site-header">
            <span>${site}</span>
            <span class="site-status">${up} up / ${down} down</span>
          </div>
          <div class="devices-grid${isMaiduguri ? ' cols-5' : ''}">
            ${sorted.map(d => `
              <div class="device ${d.status || 'gray'}" title="${d.name} - ${d.ip}">
                ${d.name.length > 10 ? d.name.substring(0, 8) + '..' : d.name}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('')}
  </div>
  
  <div class="footer">
    <div class="legend">
      <div class="legend-item"><div class="legend-dot green"></div> Online</div>
      <div class="legend-item"><div class="legend-dot blue"></div> Recovering</div>
      <div class="legend-item"><div class="legend-dot red"></div> Offline</div>
    </div>
    <div class="footer-time">Last updated: ${new Date().toLocaleTimeString()}</div>
  </div>
</body>
</html>`;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err: any) {
      console.error("[kiosk-lite] Error:", err.message, err.stack);
      res.status(500).send(`Error loading kiosk view: ${err.message}`);
    }
  });

  // Sites management endpoints
  // GET sites - no auth required (needed for kiosk mode)
  app.get("/api/sites", async (req, res) => {
    try {
      // Initialize default sites if none exist
      await storage.initializeDefaultSites();
      const sites = await storage.getSites();
      res.json(sites);
    } catch (err: any) {
      console.error("Error getting sites:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // POST create site - operators and admins only
  app.post("/api/sites", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const { name, displayOrder } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Site name is required" });
      }
      const site = await storage.createSite({ name: name.trim(), displayOrder: displayOrder || 0 });
      await storage.createLog({
        deviceId: null,
        site: "System",
        type: 'site_added',
        message: `Site "${site.name}" was added`
      });
      res.status(201).json(site);
    } catch (err: any) {
      console.error("Error creating site:", err);
      if (err.code === '23505') {
        return res.status(400).json({ message: "A site with this name already exists" });
      }
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // PATCH update site - operators and admins only
  app.patch("/api/sites/:id", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid site ID" });
      }
      const { name } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Site name is required" });
      }
      const site = await storage.updateSite(id, name.trim());
      await storage.createLog({
        deviceId: null,
        site: "System",
        type: 'site_renamed',
        message: `Site renamed to "${site.name}"`
      });
      res.json(site);
    } catch (err: any) {
      console.error("Error updating site:", err);
      if (err.code === '23505') {
        return res.status(400).json({ message: "A site with this name already exists" });
      }
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // DELETE site - operators and admins only
  app.delete("/api/sites/:id", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid site ID" });
      }
      const sites = await storage.getSites();
      const siteToDelete = sites.find(s => s.id === id);
      await storage.deleteSite(id);
      if (siteToDelete) {
        await storage.createLog({
          deviceId: null,
          site: "System",
          type: 'site_removed',
          message: `Site "${siteToDelete.name}" was deleted`
        });
      }
      res.status(204).send();
    } catch (err: any) {
      console.error("Error deleting site:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // POST reorder sites - operators and admins only
  app.post("/api/sites/reorder", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const { siteIds } = req.body;
      if (!Array.isArray(siteIds) || siteIds.length === 0) {
        return res.status(400).json({ message: "Site IDs array is required" });
      }
      await storage.reorderSites(siteIds);
      const sites = await storage.getSites();
      res.json(sites);
    } catch (err: any) {
      console.error("Error reordering sites:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // POST bulk import sites - operators and admins only
  app.post("/api/sites/bulk-import", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const { siteNames, replaceAll } = req.body;
      if (!Array.isArray(siteNames) || siteNames.length === 0) {
        return res.status(400).json({ message: "Site names array is required" });
      }
      // Filter and clean site names
      const cleanedNames = siteNames
        .filter(n => typeof n === 'string' && n.trim())
        .map(n => n.trim());
      
      if (cleanedNames.length === 0) {
        return res.status(400).json({ message: "No valid site names provided" });
      }
      
      const sites = await storage.bulkImportSites(cleanedNames, replaceAll === true);
      await storage.createLog({
        deviceId: null,
        site: "System",
        type: 'sites_imported',
        message: `Imported ${cleanedNames.length} sites`
      });
      res.json(sites);
    } catch (err: any) {
      console.error("Error importing sites:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // PATCH rename site with cascade to devices - operators and admins only
  app.patch("/api/sites/:id/rename", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid site ID" });
      }
      const { oldName, newName } = req.body;
      if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
        return res.status(400).json({ message: "New site name is required" });
      }
      if (!oldName || typeof oldName !== 'string') {
        return res.status(400).json({ message: "Old site name is required" });
      }
      const site = await storage.renameSiteWithDevices(id, oldName, newName.trim());
      await storage.createLog({
        deviceId: null,
        site: "System",
        type: 'site_renamed',
        message: `Site "${oldName}" renamed to "${newName.trim()}"`
      });
      res.json(site);
    } catch (err: any) {
      console.error("Error renaming site with devices:", err);
      if (err.code === '23505') {
        return res.status(400).json({ message: "A site with this name already exists" });
      }
      res.status(500).json({ message: err.message || "Internal server error" });
    }
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

  // Bulk delete devices
  app.post("/api/devices/bulk-delete", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      // Validate input with Zod
      const bulkDeleteSchema = z.object({
        ids: z.array(z.number().int().positive()).min(1, "At least one device ID required")
      });
      
      const parseResult = bulkDeleteSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: parseResult.error.errors[0]?.message || "Invalid request body" 
        });
      }
      
      const { ids } = parseResult.data;
      
      // Track results
      const deletedIds: number[] = [];
      const deletedDevices: Array<{ id: number; site: string }> = [];
      const notFoundIds: number[] = [];
      
      // Track errors
      const errorIds: number[] = [];
      
      // Process each ID individually to handle concurrent modifications
      for (const id of ids) {
        try {
          // Check if device exists before deleting
          const device = await storage.getDevice(id);
          if (!device) {
            notFoundIds.push(id);
            continue;
          }
          
          await storage.deleteDevice(id);
          deletedIds.push(id);
          deletedDevices.push({ id: device.id, site: device.site });
        } catch (err) {
          console.error(`Failed to delete device ${id}:`, err);
          errorIds.push(id);
        }
      }
      
      // Return 404 if all IDs were not found
      if (deletedIds.length === 0 && notFoundIds.length === ids.length) {
        return res.status(404).json({ message: "No valid device IDs found" });
      }
      
      // Return 500 if all deletions failed (excluding not found)
      if (deletedIds.length === 0 && errorIds.length > 0) {
        return res.status(500).json({ 
          message: "All deletions failed",
          failed: errorIds.length,
          notFound: notFoundIds.length
        });
      }
      
      // Only log successful deletions
      if (deletedDevices.length > 0) {
        const siteGroups = deletedDevices.reduce((acc, d) => {
          acc[d.site] = (acc[d.site] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        for (const [site, count] of Object.entries(siteGroups)) {
          await storage.createLog({
            deviceId: null,
            site,
            type: 'device_removed',
            message: `Bulk deleted ${count} device(s) from ${site}`
          });
        }
      }
      
      // Return results with details on not found and failed
      const response: { deleted: number; notFound?: number; failed?: number } = { deleted: deletedIds.length };
      if (notFoundIds.length > 0) {
        response.notFound = notFoundIds.length;
      }
      if (errorIds.length > 0) {
        response.failed = errorIds.length;
      }
      
      res.json(response);
    } catch (err) {
      console.error("Bulk delete error:", err);
      res.status(500).json({ message: "Failed to delete devices" });
    }
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

  // Get monthly availability for a device
  app.get("/api/devices/:id/availability/monthly", conditionalAuth, async (req, res) => {
    try {
      const deviceId = Number(req.params.id);
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
      const records = await storage.getMonthlyAvailability(deviceId, year);
      res.json(records);
    } catch (err: any) {
      console.error("Error fetching monthly availability:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Get annual availability for a device
  app.get("/api/devices/:id/availability/annual", conditionalAuth, async (req, res) => {
    try {
      const deviceId = Number(req.params.id);
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      const year = req.query.year ? Number(req.query.year) : undefined;
      const records = await storage.getAnnualAvailability(deviceId, year);
      res.json(records);
    } catch (err: any) {
      console.error("Error fetching annual availability:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Get all monthly availability for a year (all devices)
  app.get("/api/availability/monthly", conditionalAuth, async (req, res) => {
    try {
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
      const records = await storage.getAllMonthlyAvailabilityForYear(year);
      res.json(records);
    } catch (err: any) {
      console.error("Error fetching all monthly availability:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Get all annual availability for a year (all devices)
  app.get("/api/availability/annual", conditionalAuth, async (req, res) => {
    try {
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
      const records = await storage.getAllAnnualAvailability(year);
      res.json(records);
    } catch (err: any) {
      console.error("Error fetching all annual availability:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Manual trigger for availability snapshot (admin only, for testing)
  app.post("/api/availability/snapshot", conditionalAuth, requireRole('admin'), async (req, res) => {
    try {
      const now = new Date();
      const year = req.body.year || now.getFullYear();
      const month = req.body.month || (now.getMonth() + 1);
      
      const allDevices = await storage.getDevices();
      const results: any[] = [];
      
      for (const device of allDevices) {
        const exists = await storage.monthlySnapshotExists(device.id, year, month);
        if (exists) {
          results.push({ device: device.name, status: 'skipped', reason: 'Snapshot already exists' });
          continue;
        }
        
        const uptimePercentage = device.totalChecks > 0 
          ? ((device.successfulChecks / device.totalChecks) * 100).toFixed(2)
          : "0.00";
        
        await storage.saveMonthlyAvailability({
          deviceId: device.id,
          year,
          month,
          totalChecks: device.totalChecks,
          successfulChecks: device.successfulChecks,
          uptimePercentage
        });
        
        // Update annual aggregate
        const monthlyRecords = await storage.getMonthlyAvailability(device.id, year);
        const annualTotalChecks = monthlyRecords.reduce((sum, r) => sum + r.totalChecks, 0);
        const annualSuccessfulChecks = monthlyRecords.reduce((sum, r) => sum + r.successfulChecks, 0);
        const annualUptimePercentage = annualTotalChecks > 0
          ? ((annualSuccessfulChecks / annualTotalChecks) * 100).toFixed(2)
          : "0.00";
        
        await storage.saveAnnualAvailability({
          deviceId: device.id,
          year,
          totalChecks: annualTotalChecks,
          successfulChecks: annualSuccessfulChecks,
          uptimePercentage: annualUptimePercentage,
          monthsRecorded: monthlyRecords.length
        });
        
        if (req.body.resetCounters) {
          await storage.resetDeviceAvailabilityCounters(device.id);
        }
        
        results.push({ 
          device: device.name, 
          status: 'created', 
          uptime: uptimePercentage,
          checks: `${device.successfulChecks}/${device.totalChecks}`
        });
      }
      
      await storage.createLog({
        deviceId: null,
        site: 'System',
        type: 'system',
        message: `Manual availability snapshot triggered for ${year}-${String(month).padStart(2, '0')}`
      });
      
      res.json({ 
        message: `Processed ${allDevices.length} devices`,
        year,
        month,
        results
      });
    } catch (err: any) {
      console.error("Error creating manual snapshot:", err);
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

  // SNMP connectivity diagnostic endpoint - helps troubleshoot polling issues
  app.post("/api/snmp-diagnostics", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    const { ip, community, interfaceIndex = 1 } = req.body;
    
    if (!ip || !community) {
      return res.status(400).json({ message: "IP address and community string are required" });
    }
    
    const diagnostics: {
      timestamp: string;
      ip: string;
      community: string;
      interfaceIndex: number;
      ping: { success: boolean; message: string };
      snmp: { success: boolean; message: string; responseTime?: number };
      interfaceData?: { inOctets: string; outOctets: string };
      sysDescription?: string;
      suggestions: string[];
    } = {
      timestamp: new Date().toISOString(),
      ip,
      community: community.substring(0, 3) + '***', // Mask community for security
      interfaceIndex,
      ping: { success: false, message: '' },
      snmp: { success: false, message: '' },
      suggestions: []
    };
    
    // Step 1: Test ping connectivity
    try {
      const { stdout } = await execAsync(`ping -c 1 -W 2 ${ip}`, { timeout: 5000 });
      const pingSuccess = stdout.includes('1 received') || stdout.includes('1 packets received') || stdout.includes('bytes from');
      diagnostics.ping = { 
        success: pingSuccess, 
        message: pingSuccess ? 'Device responds to ICMP ping' : 'Device did not respond to ping'
      };
      if (!pingSuccess) {
        diagnostics.suggestions.push('Device is not responding to ping. Check if device is online and reachable.');
        diagnostics.suggestions.push('Verify the IP address is correct.');
        diagnostics.suggestions.push('Check for firewall rules blocking ICMP.');
      }
    } catch (err: any) {
      diagnostics.ping = { success: false, message: `Ping failed: ${err.message || 'timeout'}` };
      diagnostics.suggestions.push('Device is unreachable. Verify network connectivity.');
    }
    
    // Step 2: Test SNMP connectivity with system description OID
    const snmpStartTime = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const session = snmp.createSession(ip, community, { timeout: 5000, retries: 1 });
        const OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0"; // sysDescr
        
        session.get([OID_SYS_DESCR], (error: any, varbinds: any[]) => {
          session.close();
          const responseTime = Date.now() - snmpStartTime;
          
          if (error) {
            diagnostics.snmp = { 
              success: false, 
              message: `SNMP error: ${error.message || error}`,
              responseTime 
            };
            
            if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
              diagnostics.suggestions.push('SNMP request timed out. Check:');
              diagnostics.suggestions.push('  - SNMP is enabled on the device');
              diagnostics.suggestions.push('  - Community string is correct');
              diagnostics.suggestions.push('  - UDP port 161 is not blocked by firewall');
              diagnostics.suggestions.push('  - Device allows SNMP from this server IP');
            } else if (error.message?.includes('noSuchName') || error.message?.includes('noAccess')) {
              diagnostics.suggestions.push('SNMP access denied. Check community string and SNMP ACL on device.');
            }
            reject(error);
          } else if (varbinds.length > 0 && !snmp.isVarbindError(varbinds[0])) {
            diagnostics.sysDescription = String(varbinds[0].value);
            diagnostics.snmp = { 
              success: true, 
              message: 'SNMP connection successful',
              responseTime
            };
            resolve();
          } else {
            diagnostics.snmp = { 
              success: false, 
              message: 'SNMP returned no data or error',
              responseTime
            };
            diagnostics.suggestions.push('SNMP responded but returned no system info. Device may not support standard MIBs.');
            reject(new Error('No data'));
          }
        });
      });
    } catch {
      // Already handled in callback
    }
    
    // Step 3: Test interface OIDs if SNMP is working
    if (diagnostics.snmp.success) {
      try {
        await new Promise<void>((resolve, reject) => {
          const session = snmp.createSession(ip, community, { timeout: 5000, retries: 1 });
          const OID_IF_IN = `${OID_IF_IN_OCTETS_BASE}.${interfaceIndex}`;
          const OID_IF_OUT = `${OID_IF_OUT_OCTETS_BASE}.${interfaceIndex}`;
          
          session.get([OID_IF_IN, OID_IF_OUT], (error: any, varbinds: any[]) => {
            session.close();
            
            if (!error && varbinds.length >= 2 && !snmp.isVarbindError(varbinds[0]) && !snmp.isVarbindError(varbinds[1])) {
              diagnostics.interfaceData = {
                inOctets: String(varbinds[0].value),
                outOctets: String(varbinds[1].value)
              };
              resolve();
            } else {
              diagnostics.suggestions.push(`Interface ${interfaceIndex} returned no data. Try discovering available interfaces.`);
              diagnostics.suggestions.push('The interface index may be incorrect for this device.');
              reject(new Error('Interface data not available'));
            }
          });
        });
      } catch {
        // Already handled
      }
    }
    
    // Summary
    if (diagnostics.snmp.success && diagnostics.interfaceData) {
      diagnostics.suggestions = ['SNMP polling is working correctly for this device.'];
    } else if (diagnostics.snmp.success && !diagnostics.interfaceData) {
      diagnostics.suggestions.push('Use "Discover Interfaces" to find valid interface indices for this device.');
    }
    
    res.json(diagnostics);
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
    
    // Log the change
    await storage.createLog({
      deviceId: null,
      site: "System",
      type: 'settings_changed',
      message: `Polling interval changed: ${oldInterval/1000}s → ${interval/1000}s`
    });
    
    // Re-initialize staggered polling with new interval
    if ((global as any).refreshPollingSchedule) {
      (global as any).refreshPollingSchedule();
    }
    
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

  // Test email configuration by sending a test email
  app.post("/api/settings/notifications/test-email", conditionalAuth, requireRole('admin'), async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email address is required' });
      }
      
      // Import sendTestEmail function
      const { sendTestEmail } = await import('./email.js');
      const result = await sendTestEmail(email);
      res.json(result);
    } catch (err: any) {
      console.error('Error testing email:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ============= DEVICE LINKS ROUTES =============
  
  // Get all device links
  app.get("/api/device-links", async (req, res) => {
    try {
      const links = await storage.getDeviceLinks();
      res.json(links);
    } catch (err: any) {
      console.error('Error fetching device links:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Get links for a specific device
  app.get("/api/device-links/device/:deviceId", conditionalAuth, async (req, res) => {
    try {
      const deviceId = Number(req.params.deviceId);
      if (isNaN(deviceId)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      const links = await storage.getDeviceLinksByDevice(deviceId);
      res.json(links);
    } catch (err: any) {
      console.error('Error fetching device links:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Create a new device link
  app.post("/api/device-links", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const { sourceDeviceId, targetDeviceId, sourceInterfaceId, targetInterfaceId, linkType, linkLabel, bandwidthMbps } = req.body;
      
      if (!sourceDeviceId || !targetDeviceId) {
        return res.status(400).json({ message: "Source and target device IDs are required" });
      }
      
      const link = await storage.createDeviceLink({
        sourceDeviceId,
        targetDeviceId,
        sourceInterfaceId: sourceInterfaceId || null,
        targetInterfaceId: targetInterfaceId || null,
        linkType: linkType || 'manual',
        linkLabel: linkLabel || null,
        bandwidthMbps: bandwidthMbps || 1000
      });
      
      await storage.createLog({
        deviceId: sourceDeviceId,
        site: "System",
        type: 'link_created',
        message: `Device link created: ${link.linkLabel || `Device ${sourceDeviceId} <-> Device ${targetDeviceId}`}`
      });
      
      res.status(201).json(link);
    } catch (err: any) {
      console.error('Error creating device link:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Update a device link
  app.patch("/api/device-links/:id", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid link ID" });
      }
      
      const { sourceDeviceId, targetDeviceId, sourceInterfaceId, targetInterfaceId, linkType, linkLabel, bandwidthMbps } = req.body;
      
      const updates: any = {};
      if (sourceDeviceId !== undefined) updates.sourceDeviceId = sourceDeviceId;
      if (targetDeviceId !== undefined) updates.targetDeviceId = targetDeviceId;
      if (sourceInterfaceId !== undefined) updates.sourceInterfaceId = sourceInterfaceId;
      if (targetInterfaceId !== undefined) updates.targetInterfaceId = targetInterfaceId;
      if (linkType !== undefined) updates.linkType = linkType;
      if (linkLabel !== undefined) updates.linkLabel = linkLabel;
      if (bandwidthMbps !== undefined) updates.bandwidthMbps = bandwidthMbps;
      
      const link = await storage.updateDeviceLink(id, updates);
      res.json(link);
    } catch (err: any) {
      console.error('Error updating device link:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Delete a device link
  app.delete("/api/device-links/:id", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid link ID" });
      }
      
      await storage.deleteDeviceLink(id);
      res.status(204).send();
    } catch (err: any) {
      console.error('Error deleting device link:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Auto-discover device links based on network topology heuristics
  app.post("/api/device-links/auto-discover", conditionalAuth, requireRole('operator', 'admin'), async (req, res) => {
    try {
      const newLinks = await storage.autoDiscoverLinks();
      
      if (newLinks.length > 0) {
        await storage.createLog({
          deviceId: null,
          site: "System",
          type: 'links_discovered',
          message: `Auto-discovered ${newLinks.length} device link(s)`
        });
      }
      
      res.json({ discovered: newLinks.length, links: newLinks });
    } catch (err: any) {
      console.error('Error auto-discovering links:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // ============= INTERFACE AVAILABILITY ROUTES =============
  
  // Get interface monthly availability
  app.get("/api/interfaces/:id/availability/monthly", conditionalAuth, async (req, res) => {
    try {
      const interfaceId = Number(req.params.id);
      const year = Number(req.query.year) || new Date().getFullYear();
      
      if (isNaN(interfaceId)) {
        return res.status(400).json({ message: "Invalid interface ID" });
      }
      
      const availability = await storage.getInterfaceMonthlyAvailability(interfaceId, year);
      res.json(availability);
    } catch (err: any) {
      console.error('Error fetching interface availability:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // Get interface annual availability
  app.get("/api/interfaces/:id/availability/annual", conditionalAuth, async (req, res) => {
    try {
      const interfaceId = Number(req.params.id);
      const year = req.query.year ? Number(req.query.year) : undefined;
      
      if (isNaN(interfaceId)) {
        return res.status(400).json({ message: "Invalid interface ID" });
      }
      
      const availability = await storage.getInterfaceAnnualAvailability(interfaceId, year);
      res.json(availability);
    } catch (err: any) {
      console.error('Error fetching interface availability:', err);
      res.status(500).json({ message: err.message });
    }
  });

  // ============= USER SESSIONS ROUTES =============
  
  // Get active user sessions (all sites or filtered by site)
  app.get("/api/user-sessions", conditionalAuth, async (req, res) => {
    try {
      const site = req.query.site as string | undefined;
      const activeOnly = req.query.active !== 'false';
      
      let query = db.select().from(userSessions);
      
      if (site) {
        query = query.where(eq(userSessions.site, site)) as any;
      }
      
      if (activeOnly) {
        query = query.where(eq(userSessions.isActive, 1)) as any;
      }
      
      const sessions = await query.orderBy(desc(userSessions.createdAt)).limit(1000);
      res.json(sessions);
    } catch (err: any) {
      console.error('Error fetching user sessions:', err);
      res.status(500).json({ message: err.message });
    }
  });
  
  // Get total active users count (for kiosk summary)
  app.get("/api/user-sessions/count", async (req, res) => {
    try {
      const result = await db.select().from(userSessions).where(eq(userSessions.isActive, 1));
      res.json({ count: result.length });
    } catch (err: any) {
      console.error('Error fetching user count:', err);
      res.status(500).json({ message: err.message, count: 0 });
    }
  });
  
  // Get daily user statistics for graphing
  app.get("/api/user-stats/daily", conditionalAuth, async (req, res) => {
    try {
      const days = Number(req.query.days) || 30;
      const site = req.query.site as string | undefined;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
      
      let query = db.select().from(dailyUserStats).where(gte(dailyUserStats.date, startDate));
      
      if (site) {
        query = query.where(and(gte(dailyUserStats.date, startDate), eq(dailyUserStats.site, site))) as any;
      }
      
      const stats = await query.orderBy(dailyUserStats.date);
      res.json(stats);
    } catch (err: any) {
      console.error('Error fetching daily stats:', err);
      res.status(500).json({ message: err.message });
    }
  });
  
  // Export user sessions as CSV
  app.get("/api/user-sessions/export", conditionalAuth, async (req, res) => {
    try {
      const site = req.query.site as string | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      let conditions: any[] = [];
      
      if (site) {
        conditions.push(eq(userSessions.site, site));
      }
      if (startDate) {
        conditions.push(gte(userSessions.createdAt, startDate));
      }
      if (endDate) {
        conditions.push(lte(userSessions.createdAt, endDate));
      }
      
      let sessions;
      if (conditions.length > 0) {
        sessions = await db.select().from(userSessions).where(and(...conditions)).orderBy(desc(userSessions.createdAt));
      } else {
        sessions = await db.select().from(userSessions).orderBy(desc(userSessions.createdAt));
      }
      
      // Build CSV content
      const headers = ['Username', 'Email', 'MAC Address', 'IP Address', 'Site', 'Session Start', 'Upload (MB)', 'Download (MB)', 'Total Traffic (MB)', 'Active'];
      const rows = sessions.map(s => {
        const uploadMB = (Number(s.uploadBytes) / 1048576).toFixed(2);
        const downloadMB = (Number(s.downloadBytes) / 1048576).toFixed(2);
        const totalMB = ((Number(s.uploadBytes) + Number(s.downloadBytes)) / 1048576).toFixed(2);
        return [
          s.username,
          s.email || '',
          s.macAddress || '',
          s.ipAddress || '',
          s.site,
          s.sessionStart ? new Date(s.sessionStart).toISOString() : '',
          uploadMB,
          downloadMB,
          totalMB,
          s.isActive === 1 ? 'Yes' : 'No'
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      });
      
      const csv = [headers.join(','), ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="user_sessions_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (err: any) {
      console.error('Error exporting user sessions:', err);
      res.status(500).json({ message: err.message });
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
    const headers = ["name", "ip", "community", "type", "site", "poll_type", "max_bandwidth"];
    
    let csvContent = headers.join(",") + "\n";
    
    for (const device of devices) {
      const row = [
        `"${device.name}"`,
        `"${device.ip}"`,
        `"${device.community || 'public'}"`,
        `"${device.type}"`,
        `"${device.site}"`,
        `"${device.pollType || 'snmp_only'}"`,
        `${device.maxBandwidth || 100}`
      ];
      csvContent += row.join(",") + "\n";
    }
    
    if (devices.length === 0) {
      csvContent += '"Example Router","192.168.1.1","public","mikrotik","01 Cloud","snmp_only",1000\n';
      csvContent += '"Example AP","192.168.1.5","public","unifi","01 Cloud","ping_and_snmp",100\n';
      csvContent += '"Example Radio","10.0.1.1","public","radio","02-Maiduguri","ping_or_snmp",500\n';
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

  // MikroTik User Manager session data structure
  interface UserManagerSession {
    '.id'?: string;
    user?: string;
    customer?: string;
    'calling-station-id'?: string; // MAC address
    'framed-ip-address'?: string;
    'acct-input-octets'?: string;
    'acct-output-octets'?: string;
    'from-time'?: string;
    'till-time'?: string;
    status?: string;
  }

  interface UserManagerPollResult {
    count: number;
    sessions: UserManagerSession[];
  }

  // Helper function to make HTTP/HTTPS request to MikroTik REST API
  const makeUserManagerRequest = (ip: string, username: string, password: string, useHttps: boolean): Promise<UserManagerPollResult> => {
    return new Promise(async (resolve) => {
      const protocol = useHttps ? await import('https') : await import('http');
      const port = useHttps ? 443 : 80;
      
      const options = {
        hostname: ip,
        port: port,
        path: '/rest/user-manager/session',
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        rejectUnauthorized: false // MikroTik devices typically use self-signed certs
      };
      
      const req = protocol.request(options, (res: any) => {
        let data = '';
        
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const sessions = JSON.parse(data) as UserManagerSession[];
              // Filter for active sessions only (sessions without 'till-time' or with active status)
              const activeSessions = Array.isArray(sessions) 
                ? sessions.filter(s => !s['till-time'] || s.status === 'start')
                : [];
              console.log(`[api] User Manager sessions for ${ip} (${useHttps ? 'HTTPS' : 'HTTP'}): ${activeSessions.length} active (${sessions.length} total)`);
              resolve({ count: activeSessions.length, sessions: activeSessions });
            } else {
              console.log(`[api] User Manager API failed for ${ip}: ${useHttps ? 'HTTPS' : 'HTTP'} ${res.statusCode}`);
              resolve({ count: -1, sessions: [] }); // -1 indicates failure, trigger fallback
            }
          } catch (parseError) {
            console.log(`[api] User Manager API parse error for ${ip}: ${parseError}`);
            resolve({ count: -1, sessions: [] });
          }
        });
      });
      
      req.on('error', (error: any) => {
        console.log(`[api] User Manager ${useHttps ? 'HTTPS' : 'HTTP'} error for ${ip}: ${error.message}`);
        resolve({ count: -1, sessions: [] }); // -1 indicates failure, trigger fallback
      });
      
      req.on('timeout', () => {
        console.log(`[api] User Manager ${useHttps ? 'HTTPS' : 'HTTP'} timeout for ${ip}`);
        req.destroy();
        resolve({ count: -1, sessions: [] });
      });
      
      req.end();
    });
  };

  // Helper function to poll Mikrotik User Manager active users via REST API
  // Tries HTTPS first, falls back to HTTP if HTTPS fails
  // Queries /rest/user-manager/session to get active RADIUS sessions (not hotspot)
  const pollMikrotikUserManagerAPI = async (ip: string, username: string, password: string): Promise<UserManagerPollResult> => {
    // Try HTTPS first
    let result = await makeUserManagerRequest(ip, username, password, true);
    
    // If HTTPS failed, try HTTP
    if (result.count === -1) {
      console.log(`[api] HTTPS failed for ${ip}, trying HTTP...`);
      result = await makeUserManagerRequest(ip, username, password, false);
    }
    
    // If both failed, return 0
    if (result.count === -1) {
      return { count: 0, sessions: [] };
    }
    
    return result;
  };
  
  // Helper function to save user sessions to database
  const saveUserSessions = async (deviceId: number, site: string, sessions: UserManagerSession[]) => {
    try {
      // Mark existing active sessions as ended
      await db.update(userSessions)
        .set({ isActive: 0, updatedAt: new Date() })
        .where(and(eq(userSessions.deviceId, deviceId), eq(userSessions.isActive, 1)));
      
      // Insert new active sessions
      for (const session of sessions) {
        const username = session.user || session.customer || 'unknown';
        const sessionId = session['.id'] || null;
        const macAddress = session['calling-station-id'] || null;
        const ipAddress = session['framed-ip-address'] || null;
        const uploadBytes = BigInt(session['acct-output-octets'] || '0');
        const downloadBytes = BigInt(session['acct-input-octets'] || '0');
        
        await db.insert(userSessions).values({
          deviceId,
          site,
          sessionId,
          username,
          macAddress,
          ipAddress,
          uploadBytes,
          downloadBytes,
          isActive: 1,
          sessionStart: session['from-time'] ? new Date(session['from-time']) : new Date(),
        });
      }
      
      // Update daily stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const existingStats = await db.select()
        .from(dailyUserStats)
        .where(and(
          eq(dailyUserStats.site, site),
          eq(dailyUserStats.date, today)
        ))
        .limit(1);
      
      const totalUpload = sessions.reduce((sum, s) => sum + BigInt(s['acct-output-octets'] || '0'), BigInt(0));
      const totalDownload = sessions.reduce((sum, s) => sum + BigInt(s['acct-input-octets'] || '0'), BigInt(0));
      
      if (existingStats.length > 0) {
        const newPeak = Math.max(existingStats[0].peakUsers, sessions.length);
        await db.update(dailyUserStats)
          .set({
            totalUsers: sessions.length,
            peakUsers: newPeak,
            totalUploadBytes: totalUpload,
            totalDownloadBytes: totalDownload
          })
          .where(eq(dailyUserStats.id, existingStats[0].id));
      } else {
        await db.insert(dailyUserStats).values({
          deviceId,
          site,
          date: today,
          totalUsers: sessions.length,
          peakUsers: sessions.length,
          totalUploadBytes: totalUpload,
          totalDownloadBytes: totalDownload
        });
      }
      
      console.log(`[api] Saved ${sessions.length} user sessions for device ${deviceId}`);
    } catch (error) {
      console.error(`[api] Failed to save user sessions: ${error}`);
    }
  };

  // Helper function to ping a device (ICMP ping via system command)
  const pingDevice = (device: any): Promise<void> => {
    return new Promise(async (resolve) => {
      console.log(`[ping] Pinging ${device.name} at ${device.ip}...`);
      
      try {
        // Use system ping command with timeout
        const { stdout, stderr } = await execAsync(`ping -c 1 -W 2 ${device.ip}`, { timeout: 5000 });
        
        let newStatus = 'green';
        
        // Check if ping was successful
        if (stdout.includes('1 received') || stdout.includes('1 packets received') || stdout.includes('bytes from')) {
          console.log(`[ping] ${device.name} is reachable`);
          
          // If device was previously offline, mark as recovering
          if (device.status === 'red') {
            newStatus = 'blue';
          } else {
            newStatus = 'green';
          }
          
          // Log status change if recovering
          if (device.status !== newStatus) {
            console.log(`[ping] Status change for ${device.name}: ${device.status} -> ${newStatus}`);
            
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
            
            if (device.status === 'red') {
              notifyDeviceRecovery(device).catch(err => 
                console.error('[notifications] Failed to send recovery notification:', err)
              );
            }
          }
          
          await storage.updateDeviceMetrics(device.id, {
            status: newStatus,
            utilization: 0,
            bandwidthMBps: "0.00",
            downloadMbps: "0.00",
            uploadMbps: "0.00",
            lastInCounter: BigInt(0),
            lastOutCounter: BigInt(0),
            totalChecks: device.totalChecks + 1,
            successfulChecks: device.successfulChecks + 1,
            activeUsers: 0
          });
        } else {
          throw new Error('Ping failed - no response');
        }
      } catch (error: any) {
        console.log(`[ping] ${device.name} is unreachable: ${error.message || 'timeout'}`);
        
        const newStatus = 'red';
        
        // Log status change to offline
        if (device.status !== 'red') {
          console.log(`[ping] Status change for ${device.name}: ${device.status} -> red`);
          
          const statusLabels: Record<string, string> = {
            'green': 'Online',
            'red': 'Offline',
            'blue': 'Recovering',
            'unknown': 'Unknown'
          };
          const oldLabel = statusLabels[device.status] || device.status;
          
          await storage.createLog({
            deviceId: device.id,
            site: device.site,
            type: 'status_change',
            message: `${device.name} status changed: ${oldLabel} → Offline`
          });
          
          notifyDeviceOffline(device).catch(err => 
            console.error('[notifications] Failed to send offline notification:', err)
          );
        }
        
        await storage.updateDeviceMetrics(device.id, {
          status: newStatus,
          utilization: 0,
          bandwidthMBps: "0.00",
          downloadMbps: "0.00",
          uploadMbps: "0.00",
          lastInCounter: BigInt(0),
          lastOutCounter: BigInt(0),
          totalChecks: device.totalChecks + 1,
          successfulChecks: device.successfulChecks,
          activeUsers: 0
        });
      }
      
      resolve();
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
          
          // Utilization based on total throughput vs device's max bandwidth setting
          const maxBw = device.maxBandwidth || 100;
          newUtilization = Math.min(100, Math.floor((totalMbps / maxBw) * 100));

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
        
        // Poll active users for Mikrotik devices via SNMP (User Manager API runs independently)
        // Preserve last known value on failure
        let activeUsers = device.activeUsers || 0;
        if (device.type === 'mikrotik' && isSuccess && !device.apiUsername) {
          // Only poll via SNMP if device doesn't have User Manager API credentials
          // (devices with API credentials are polled by the independent User Manager polling loop)
          try {
            const polledUsers = await pollMikrotikActiveUsers(device.ip, device.community);
            activeUsers = polledUsers;
          } catch (err) {
            console.log(`[snmp] Could not poll hotspot users for ${device.name}: ${err}`);
            // Keep the existing activeUsers value (already set above)
          }
        }
        // If device is offline, preserve the last known user count (don't reset to 0)
        
        // Skip update if availability reset is in progress
        if (isAvailabilityResetInProgress) {
          console.log(`[snmp] Skipping metrics update for ${device.name} - availability reset in progress`);
          session.close();
          resolve();
          return;
        }
        
        // Re-fetch current device state to get fresh counter values (avoids race with reset)
        const freshDevices = await storage.getDevices();
        const freshDevice = freshDevices.find(d => d.id === device.id);
        if (!freshDevice) {
          session.close();
          resolve();
          return;
        }
        
        // For devices with User Manager API credentials, preserve the activeUsers from independent polling
        // For devices without API credentials, use the SNMP-polled value
        const finalActiveUsers = device.apiUsername && device.apiPassword 
          ? freshDevice.activeUsers 
          : activeUsers;
        
        await storage.updateDeviceMetrics(device.id, {
          status: newStatus,
          utilization: newUtilization,
          bandwidthMBps,
          downloadMbps,
          uploadMbps,
          lastInCounter,
          lastOutCounter,
          totalChecks: freshDevice.totalChecks + 1,
          successfulChecks: isSuccess ? freshDevice.successfulChecks + 1 : freshDevice.successfulChecks,
          activeUsers: finalActiveUsers
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

        // Track interface availability (increment totalChecks always, successfulChecks only when online)
        // Fetch fresh interface data to get current counter values
        try {
          const freshInterfaces = await storage.getDeviceInterfaces(device.id);
          const freshIface = freshInterfaces.find(i => i.id === iface.id);
          if (freshIface) {
            const newTotalChecks = (freshIface.totalChecks || 0) + 1;
            const newSuccessfulChecks = (freshIface.successfulChecks || 0) + (ifaceStatus === 'green' ? 1 : 0);
            await storage.updateInterfaceAvailabilityMetrics(iface.id, newTotalChecks, newSuccessfulChecks);
          }
        } catch (availErr) {
          console.error(`[snmp] Error updating interface availability for ${iface.id}:`, availErr);
        }

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

  // Helper: Check if ping succeeds (returns boolean)
  const checkPing = async (ip: string): Promise<boolean> => {
    try {
      const { stdout } = await execAsync(`ping -c 1 -W 2 ${ip}`, { timeout: 5000 });
      return stdout.includes('1 received') || stdout.includes('1 packets received') || stdout.includes('bytes from');
    } catch {
      return false;
    }
  };

  // Helper: Check if SNMP succeeds (returns boolean)
  const checkSnmp = (ip: string, community: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const session = snmp.createSession(ip, community, { timeout: 2000, retries: 1 });
      session.get([`${OID_IF_IN_OCTETS_BASE}.1`], (error, varbinds) => {
        session.close();
        if (!error && varbinds.length > 0 && !snmp.isVarbindError(varbinds[0])) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  };

  // Unified polling function that handles all poll types
  const pollDeviceUnified = async (device: any, intervalSeconds: number): Promise<void> => {
    const pollType = device.pollType || 'snmp_only';
    let isOnline = false;
    let pingSuccess = false;
    let snmpSuccess = false;

    // Determine which checks to run based on pollType
    if (pollType === 'ping_only') {
      pingSuccess = await checkPing(device.ip);
      isOnline = pingSuccess;
    } else if (pollType === 'snmp_only') {
      // Use full SNMP polling with metrics
      return pollDevice(device, intervalSeconds);
    } else if (pollType === 'ping_and_snmp') {
      // Both must succeed
      [pingSuccess, snmpSuccess] = await Promise.all([
        checkPing(device.ip),
        checkSnmp(device.ip, device.community)
      ]);
      isOnline = pingSuccess && snmpSuccess;
      
      // If SNMP succeeded, also collect metrics
      if (snmpSuccess) {
        await pollDevice(device, intervalSeconds);
        return;
      }
    } else if (pollType === 'ping_or_snmp') {
      // Either can succeed
      [pingSuccess, snmpSuccess] = await Promise.all([
        checkPing(device.ip),
        checkSnmp(device.ip, device.community)
      ]);
      isOnline = pingSuccess || snmpSuccess;
      
      // If SNMP succeeded, also collect metrics
      if (snmpSuccess) {
        await pollDevice(device, intervalSeconds);
        return;
      }
    }

    // For ping_only or when SNMP failed in hybrid modes, update status without metrics
    let newStatus = isOnline ? (device.status === 'red' ? 'blue' : 'green') : 'red';
    
    console.log(`[poll] ${device.name} (${pollType}): ping=${pingSuccess}, snmp=${snmpSuccess}, status=${newStatus}`);
    
    // Log status change
    if (device.status !== newStatus) {
      const statusLabels: Record<string, string> = {
        'green': 'Online', 'red': 'Offline', 'blue': 'Recovering', 'unknown': 'Unknown'
      };
      const oldLabel = statusLabels[device.status] || device.status;
      const newLabel = statusLabels[newStatus] || newStatus;
      
      await storage.createLog({
        deviceId: device.id,
        site: device.site,
        type: 'status_change',
        message: `${device.name} status changed: ${oldLabel} → ${newLabel}`
      });
      
      if (isOnline && device.status === 'red') {
        notifyDeviceRecovery(device).catch(err => 
          console.error('[notifications] Failed to send recovery notification:', err)
        );
      } else if (!isOnline && device.status !== 'red') {
        notifyDeviceOffline(device).catch(err => 
          console.error('[notifications] Failed to send offline notification:', err)
        );
      }
    }
    
    // Skip update if availability reset is in progress to avoid overwriting reset counters
    if (isAvailabilityResetInProgress) {
      console.log(`[poll] Skipping update for ${device.name} - availability reset in progress`);
      return;
    }
    
    // For ping-only and hybrid modes without SNMP data: preserve existing metrics, just update status and counters
    // Only set metrics to zero for ping_only devices; hybrid modes should preserve last known SNMP values
    const isPingOnlyMode = pollType === 'ping_only';
    
    // Re-fetch current device state to get latest counter values (avoids race with reset)
    // Use getDevice(id) instead of getDevices() to avoid O(n²) queries with 169+ devices
    const freshDevice = await storage.getDevice(device.id);
    if (!freshDevice) return;
    
    // For devices with User Manager API credentials, always preserve activeUsers from independent polling
    // For other ping_only devices without API credentials, set to 0
    const hasUserManagerAPI = device.apiUsername && device.apiPassword;
    const finalActiveUsers = hasUserManagerAPI 
      ? freshDevice.activeUsers 
      : (isPingOnlyMode ? 0 : freshDevice.activeUsers);
    
    await storage.updateDeviceMetrics(device.id, {
      status: newStatus,
      utilization: isPingOnlyMode ? 0 : freshDevice.utilization,
      bandwidthMBps: isPingOnlyMode ? "0.00" : freshDevice.bandwidthMBps,
      downloadMbps: isPingOnlyMode ? "0.00" : freshDevice.downloadMbps,
      uploadMbps: isPingOnlyMode ? "0.00" : freshDevice.uploadMbps,
      lastInCounter: isPingOnlyMode ? BigInt(0) : freshDevice.lastInCounter,
      lastOutCounter: isPingOnlyMode ? BigInt(0) : freshDevice.lastOutCounter,
      totalChecks: freshDevice.totalChecks + 1,
      successfulChecks: isOnline ? freshDevice.successfulChecks + 1 : freshDevice.successfulChecks,
      activeUsers: finalActiveUsers
    });
  };

  // Track individual device poll timers for continuous staggered polling
  const devicePollTimers: Map<number, NodeJS.Timeout> = new Map();
  let linkUpdateInterval: NodeJS.Timeout | null = null;
  
  // Poll a single device and reschedule its next poll
  const pollSingleDevice = async (deviceId: number) => {
    // Skip actual polling during availability reset, but always reschedule
    if (!isAvailabilityResetInProgress) {
      try {
        const device = await storage.getDevice(deviceId);
        if (!device) {
          devicePollTimers.delete(deviceId);
          return; // Device was deleted, don't reschedule
        }
        
        const intervalSeconds = currentPollingInterval / 1000;
        await pollDeviceUnified(device, intervalSeconds);
      } catch (err) {
        console.error(`[poll] Error polling device ${deviceId}:`, err);
      }
    }
    
    // Always reschedule this device's next poll (keeps timer alive even during reset)
    const timer = setTimeout(() => pollSingleDevice(deviceId), currentPollingInterval);
    devicePollTimers.set(deviceId, timer);
  };
  
  // Initialize staggered polling - each device gets its own timer offset
  const initializeStaggeredPolling = async () => {
    // Clear any existing timers
    for (const timer of devicePollTimers.values()) {
      clearTimeout(timer);
    }
    devicePollTimers.clear();
    
    const devices = await storage.getDevices();
    if (devices.length === 0) {
      console.log('[poll] No devices to poll');
      return;
    }
    
    // Calculate stagger offset between each device
    // Spread devices evenly across 80% of the polling interval
    const staggerWindow = currentPollingInterval * 0.8;
    const offsetPerDevice = Math.floor(staggerWindow / devices.length);
    
    console.log(`[poll] Initializing staggered polling for ${devices.length} devices`);
    console.log(`[poll] Polling interval: ${currentPollingInterval}ms, offset per device: ${offsetPerDevice}ms`);
    
    // Schedule each device with its own offset
    devices.forEach((device, index) => {
      const initialDelay = index * offsetPerDevice;
      const timer = setTimeout(() => pollSingleDevice(device.id), initialDelay);
      devicePollTimers.set(device.id, timer);
    });
    
    console.log(`[poll] Scheduled ${devices.length} devices for continuous staggered polling`);
  };
  
  // Update device links periodically (separate from device polling)
  const updateDeviceLinks = async () => {
    if (isAvailabilityResetInProgress) return;
    
    try {
      const allLinks = await storage.getDeviceLinks();
      if (allLinks.length === 0) return;
      
      const devices = await storage.getDevices();
      const devicesMap = new Map(devices.map(d => [d.id, d]));
      
      for (const link of allLinks) {
        const sourceDevice = devicesMap.get(link.sourceDeviceId);
        const targetDevice = devicesMap.get(link.targetDeviceId);
        
        let linkStatus = 'down';
        if (sourceDevice && targetDevice) {
          if (sourceDevice.status === 'green' && targetDevice.status === 'green') {
            linkStatus = 'up';
          } else if (sourceDevice.status === 'blue' || targetDevice.status === 'blue') {
            linkStatus = 'degraded';
          } else if (sourceDevice.status !== 'red' && targetDevice.status !== 'red') {
            linkStatus = 'degraded';
          }
        }
        
        let trafficMbps = "0.00";
        if (sourceDevice) {
          const totalMbps = parseFloat(sourceDevice.downloadMbps || "0") + parseFloat(sourceDevice.uploadMbps || "0");
          trafficMbps = totalMbps.toFixed(2);
        }
        
        await storage.updateDeviceLinkTraffic(link.id, trafficMbps, linkStatus);
      }
    } catch (linkErr) {
      console.error('[poll] Error updating device link traffic:', linkErr);
    }
  };
  
  // Start continuous link updates every 5 seconds
  const startLinkUpdates = () => {
    if (linkUpdateInterval) {
      clearInterval(linkUpdateInterval);
    }
    linkUpdateInterval = setInterval(updateDeviceLinks, 5000);
  };
  
  // User Manager API polling - runs independently of SNMP/ping polling
  let userManagerPollingInterval: NodeJS.Timeout | null = null;
  
  const pollUserManagerAPIs = async () => {
    if (isAvailabilityResetInProgress) return;
    
    try {
      const devices = await storage.getDevices();
      // Poll all devices that have User Manager API credentials configured
      const userManagerDevices = devices.filter(d => d.apiUsername && d.apiPassword);
      
      // Debug: Show device credential status
      const devicesWithApiUser = devices.filter(d => d.apiUsername);
      const devicesWithApiPass = devices.filter(d => d.apiPassword);
      console.log(`[usermanager] Credential check: ${devices.length} devices, ${devicesWithApiUser.length} have username, ${devicesWithApiPass.length} have password, ${userManagerDevices.length} have both`);
      
      if (userManagerDevices.length === 0) {
        return;
      }
      
      console.log(`[usermanager] Polling: ${userManagerDevices.map(d => `${d.name}@${d.ip}`).join(', ')}`);
      
      for (const device of userManagerDevices) {
        try {
          const pollResult = await pollMikrotikUserManagerAPI(device.ip, device.apiUsername!, device.apiPassword!);
          console.log(`[usermanager] ${device.name}: ${pollResult.count} active sessions`);
          
          // Save user sessions to database (handles zero sessions case to reset active flags)
          await saveUserSessions(device.id, device.site, pollResult.sessions);
          
          // Update device activeUsers count using partial update (preserves other metrics)
          await storage.updateDevice(device.id, {
            activeUsers: pollResult.count
          });
        } catch (err) {
          console.log(`[usermanager] Failed to poll ${device.name}: ${err}`);
        }
      }
    } catch (err) {
      console.error('[usermanager] Error in User Manager API polling:', err);
    }
  };
  
  // Start User Manager API polling every 30 seconds (independent of device status polling)
  const startUserManagerPolling = () => {
    if (userManagerPollingInterval) {
      clearInterval(userManagerPollingInterval);
    }
    // Initial poll immediately
    pollUserManagerAPIs();
    // Then poll every 30 seconds
    userManagerPollingInterval = setInterval(pollUserManagerAPIs, 30000);
    console.log('[usermanager] Started independent User Manager API polling (30s interval)');
  };
  
  // Re-initialize polling when devices are added/removed
  const refreshPollingSchedule = async () => {
    console.log('[poll] Refreshing polling schedule for device changes');
    await initializeStaggeredPolling();
  };
  
  // Export for use in device CRUD operations
  (global as any).refreshPollingSchedule = refreshPollingSchedule;
  
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
  
  // Start continuous staggered polling
  initializeStaggeredPolling();
  startLinkUpdates();
  startUserManagerPolling();

  // Month-end availability reset scheduler
  // Runs at 23:59 on the last day of each month
  const runMonthEndAvailabilitySnapshot = async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    
    console.log(`[availability] Running month-end availability snapshot for ${year}-${String(month).padStart(2, '0')}`);
    
    // Set flag to pause polling during reset
    isAvailabilityResetInProgress = true;
    console.log('[availability] Pausing polling for availability reset');
    
    try {
      // Wait a moment for any in-flight polls to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fetch fresh device data after polls have settled
      const allDevices = await storage.getDevices();
      
      for (const device of allDevices) {
        // Check if snapshot already exists for this device/month (idempotency)
        const exists = await storage.monthlySnapshotExists(device.id, year, month);
        if (exists) {
          console.log(`[availability] Snapshot already exists for device ${device.name} (${year}-${month}), skipping`);
          continue;
        }
        
        // Calculate uptime percentage
        const uptimePercentage = device.totalChecks > 0 
          ? ((device.successfulChecks / device.totalChecks) * 100).toFixed(2)
          : "0.00";
        
        // Save monthly snapshot
        await storage.saveMonthlyAvailability({
          deviceId: device.id,
          year,
          month,
          totalChecks: device.totalChecks,
          successfulChecks: device.successfulChecks,
          uptimePercentage
        });
        
        console.log(`[availability] Saved monthly snapshot for ${device.name}: ${uptimePercentage}% (${device.successfulChecks}/${device.totalChecks})`);
        
        // Update annual aggregate
        const monthlyRecords = await storage.getMonthlyAvailability(device.id, year);
        const annualTotalChecks = monthlyRecords.reduce((sum, r) => sum + r.totalChecks, 0);
        const annualSuccessfulChecks = monthlyRecords.reduce((sum, r) => sum + r.successfulChecks, 0);
        const annualUptimePercentage = annualTotalChecks > 0
          ? ((annualSuccessfulChecks / annualTotalChecks) * 100).toFixed(2)
          : "0.00";
        
        await storage.saveAnnualAvailability({
          deviceId: device.id,
          year,
          totalChecks: annualTotalChecks,
          successfulChecks: annualSuccessfulChecks,
          uptimePercentage: annualUptimePercentage,
          monthsRecorded: monthlyRecords.length
        });
        
        console.log(`[availability] Updated annual aggregate for ${device.name}: ${annualUptimePercentage}% (${monthlyRecords.length} months)`);
        
        // Reset device counters for next month
        await storage.resetDeviceAvailabilityCounters(device.id);
      }
      
      // Log system event
      await storage.createLog({
        deviceId: null,
        site: 'System',
        type: 'system',
        message: `Monthly availability reset completed for ${allDevices.length} devices (${year}-${String(month).padStart(2, '0')})`
      });
      
      console.log(`[availability] Month-end snapshot complete for ${allDevices.length} devices`);
    } catch (err) {
      console.error('[availability] Failed to run month-end snapshot:', err);
    } finally {
      // Resume polling
      isAvailabilityResetInProgress = false;
      console.log('[availability] Resuming polling after availability reset');
      
      // Re-initialize staggered polling to ensure fresh start after reset
      if ((global as any).refreshPollingSchedule) {
        (global as any).refreshPollingSchedule();
      }
    }
  };

  // Check every minute if we need to run the month-end snapshot
  const checkMonthEndSchedule = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // Check if it's the last day of the month at 23:59
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isLastDayOfMonth = tomorrow.getDate() === 1;
    
    if (isLastDayOfMonth && hours === 23 && minutes === 59) {
      runMonthEndAvailabilitySnapshot();
    }
  };

  // Run check every minute
  setInterval(checkMonthEndSchedule, 60000);
  console.log('[availability] Month-end availability scheduler started');

  return httpServer;
}
