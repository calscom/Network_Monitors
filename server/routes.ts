import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import snmp from "net-snmp";
import { insertDeviceSchema } from "@shared/schema";

const OID_IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10.1";  // Download (inbound)
const OID_IF_OUT_OCTETS = "1.3.6.1.2.1.2.2.1.16.1"; // Upload (outbound) 

const SITES = [
  "01 Cloud", "02-Maiduguri", "03-Gwoza", "04-Bama", "05-Ngala", 
  "06-Dikwa", "07-Monguno", "08-Damasak", "09-Banki", "10-CN1", 
  "11-CN2", "12-Damboa"
];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get(api.devices.list.path, async (req, res) => {
    const devices = await storage.getDevices();
    res.json(devices);
  });

  app.get("/api/logs", async (req, res) => {
    const site = req.query.site as string;
    const logs = await storage.getLogs(site);
    res.json(logs);
  });

  app.post(api.devices.create.path, async (req, res) => {
    try {
      const input = api.devices.create.input.parse(req.body);
      const device = await storage.createDevice(input);
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

  app.delete(api.devices.delete.path, async (req, res) => {
    await storage.deleteDevice(Number(req.params.id));
    res.status(204).send();
  });

  app.patch("/api/devices/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid device ID" });
      }
      
      const input = insertDeviceSchema.partial().parse(req.body);
      const device = await storage.updateDevice(id, input);
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
      res.json({ updated: count });
    } catch (err: any) {
      console.error("Error reassigning devices:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  app.get("/api/devices/:id/history", async (req, res) => {
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

  app.get("/api/devices/template", async (req, res) => {
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

  // Background polling service
  setInterval(async () => {
    const devices = await storage.getDevices();
    
    for (const device of devices) {
      const session = snmp.createSession(device.ip, device.community, {
        timeout: 2000,
        retries: 1
      });

      console.log(`[snmp] Polling ${device.name} at ${device.ip}...`);

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

          // Calculate download speed (Mbps) from inbound octets
          if (lastInCounter > BigInt(0) && currentInCounter >= lastInCounter) {
            const deltaBytes = Number(currentInCounter - lastInCounter);
            const mbpsValue = (deltaBytes * 8) / (5 * 1000 * 1000);
            downloadMbps = mbpsValue.toFixed(2);
          } else {
            downloadMbps = "0.00";
          }

          // Calculate upload speed (Mbps) from outbound octets
          if (lastOutCounter > BigInt(0) && currentOutCounter >= lastOutCounter) {
            const deltaBytes = Number(currentOutCounter - lastOutCounter);
            const mbpsValue = (deltaBytes * 8) / (5 * 1000 * 1000);
            uploadMbps = mbpsValue.toFixed(2);
          } else {
            uploadMbps = "0.00";
          }

          // Total bandwidth in MBps (combined download + upload, converted from Mbps)
          const totalMbps = parseFloat(downloadMbps) + parseFloat(uploadMbps);
          bandwidthMBps = (totalMbps / 8).toFixed(2);
          
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

        // Mocking for Demo ONLY if it's a localhost or specific ranges
        const isMockable = device.ip === '127.0.0.1' || 
                          device.ip === 'localhost' || 
                          device.ip.startsWith('10.0.0.') ||
                          device.ip.startsWith('10.10.10.') ||
                          device.ip.startsWith('192.168.1.');

        if (isMockable) {
           if (device.status === 'red' || error) {
             newStatus = 'green';
           } else {
             newStatus = 'green';
           }
           // Use real data if available, otherwise mock it
           if (parseFloat(downloadMbps) === 0 && parseFloat(uploadMbps) === 0) {
             downloadMbps = (Math.random() * 60 + 10).toFixed(2);
             uploadMbps = (Math.random() * 30 + 5).toFixed(2);
             const totalMbps = parseFloat(downloadMbps) + parseFloat(uploadMbps);
             bandwidthMBps = (totalMbps / 8).toFixed(2);
             newUtilization = Math.floor((totalMbps / 1000) * 100);
           }
        }

        if (device.status !== newStatus) {
          console.log(`[snmp] Status change for ${device.name}: ${device.status} -> ${newStatus}`);
          await storage.createLog({
            deviceId: device.id,
            site: device.site,
            type: 'status_change',
            message: `Device ${device.name} changed status from ${device.status} to ${newStatus}`
          });
        }

        await storage.updateDeviceMetrics(device.id, {
          status: newStatus,
          utilization: newUtilization,
          bandwidthMBps,
          downloadMbps,
          uploadMbps,
          lastInCounter,
          lastOutCounter
        });

        // Save metrics snapshot for historical tracking (every poll cycle)
        if (newStatus === 'green' || isMockable) {
          await storage.saveMetricsSnapshot({
            deviceId: device.id,
            site: device.site,
            utilization: newUtilization,
            bandwidthMBps
          });
        }
        
        session.close();
      });
    }
  }, 5000);

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
