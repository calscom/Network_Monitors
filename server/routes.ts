import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import snmp from "net-snmp";

const OID_IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10.1"; 

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

  // Background polling service
  setInterval(async () => {
    const devices = await storage.getDevices();
    
    for (const device of devices) {
      const session = snmp.createSession(device.ip, device.community, {
        timeout: 2000,
        retries: 1
      });

      console.log(`[snmp] Polling ${device.name} at ${device.ip}...`);

      session.get([OID_IF_IN_OCTETS], async (error, varbinds) => {
        let newStatus = 'red';
        let newUtilization = device.utilization;
        let bandwidthMBps = device.bandwidthMBps;
        let lastCounter = device.lastCounter;

        if (!error && !snmp.isVarbindError(varbinds[0])) {
          const currentCounter = BigInt(varbinds[0].value);
          console.log(`[snmp] Response from ${device.name}: ${currentCounter}`);
          
          if (device.status === 'red') {
            newStatus = 'blue';
          } else {
            newStatus = 'green';
          }

          // Calculate bandwidth (MBps)
          // Delta is bytes over 5 seconds (interval)
          if (lastCounter > BigInt(0) && currentCounter >= lastCounter) {
            const deltaBytes = Number(currentCounter - lastCounter);
            const bytesPerSec = deltaBytes / 5;
            const mbpsValue = (bytesPerSec / (1024 * 1024));
            bandwidthMBps = mbpsValue.toFixed(2);
            
            // Simulation of utilization based on a hypothetical 100MBps link
            newUtilization = Math.min(100, Math.floor((mbpsValue / 100) * 100));
          } else {
             // First run or overflow
             bandwidthMBps = "0.01"; // Set to small non-zero for first run visibility
             newUtilization = 0;
          }
          lastCounter = currentCounter;
        } else {
          console.error(`[snmp] Error polling ${device.name}: ${error?.message || 'Unknown error'}`);
          newStatus = 'red';
          bandwidthMBps = "0.00";
          newUtilization = 0;
        }

        // Mocking for Demo ONLY if it's a localhost or specific range
        if (device.ip === '127.0.0.1' || device.ip === 'localhost' || device.ip.startsWith('10.0.0.')) {
           if (device.status === 'red') newStatus = 'blue';
           else newStatus = 'green';
           const mockMbps = (Math.random() * 80).toFixed(2);
           bandwidthMBps = mockMbps;
           newUtilization = Math.floor((Number(mockMbps) / 100) * 100);
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
          lastCounter
        });
        
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
