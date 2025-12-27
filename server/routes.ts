import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import snmp from "net-snmp";

const OID_IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10.1"; 

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get(api.devices.list.path, async (req, res) => {
    const devices = await storage.getDevices();
    res.json(devices);
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

  setInterval(async () => {
    const devices = await storage.getDevices();
    
    for (const device of devices) {
      const session = snmp.createSession(device.ip, device.community, {
        timeout: 1000,
        retries: 1
      });

      session.get([OID_IF_IN_OCTETS], async (error, varbinds) => {
        let newStatus = 'red';
        let newUtilization = 0;
        let newBandwidthMBps = "0";
        let newCounter = 0;

        if (error) {
          newStatus = 'red';
        } else {
          if (snmp.isVarbindError(varbinds[0])) {
             newStatus = 'red';
          } else {
             newCounter = varbinds[0].value;
             newStatus = device.status === 'red' ? 'blue' : 'green';
             
             // Calculate bandwidth if we have a previous counter
             if (device.lastCounter > 0 && newCounter >= device.lastCounter) {
               const deltaBytes = newCounter - device.lastCounter;
               const intervalSeconds = 5; // Poll interval
               const bytesPerSecond = deltaBytes / intervalSeconds;
               const mbps = (bytesPerSecond * 8) / 1000000; // Bits to Megabits
               const MBps = bytesPerSecond / (1024 * 1024); // Bytes to Megabytes
               newBandwidthMBps = MBps.toFixed(2);
               
               // For utilization percentage, assume a 1Gbps link for simulation
               newUtilization = Math.min(100, Math.floor((mbps / 1000) * 100));
             } else {
               // Initial or overflow simulation
               newUtilization = Math.floor(Math.random() * 20);
               newBandwidthMBps = (Math.random() * 5).toFixed(2);
             }
          }
        }
        
        if (device.ip === '127.0.0.1' || device.ip === 'localhost') {
           newStatus = device.status === 'red' ? 'blue' : 'green';
           newUtilization = Math.floor(Math.random() * 100);
           newBandwidthMBps = (Math.random() * 100).toFixed(2);
           newCounter = device.lastCounter + Math.floor(Math.random() * 1000000);
        }

        await storage.updateDeviceStatus(device.id, newStatus, newUtilization, newBandwidthMBps, newCounter);
        session.close();
      });
    }
  }, 5000);

  const existing = await storage.getDevices();
  if (existing.length === 0) {
    await storage.createDevice({
      name: "Core Router",
      ip: "127.0.0.1",
      community: "public",
      type: "mikrotik",
    });
    await storage.createDevice({
      name: "Office WiFi",
      ip: "192.168.1.5",
      community: "public",
      type: "unifi",
    });
  }

  return httpServer;
}
