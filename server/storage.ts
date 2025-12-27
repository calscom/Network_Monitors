import { db } from "./db";
import { devices, type Device, type InsertDevice } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getDevices(): Promise<Device[]>;
  createDevice(device: InsertDevice): Promise<Device>;
  deleteDevice(id: number): Promise<void>;
  updateDeviceMetrics(id: number, status: string, utilization: number, bandwidthMBps: string, lastCounter: bigint): Promise<Device>;
}

export class DatabaseStorage implements IStorage {
  async getDevices(): Promise<Device[]> {
    return await db.select().from(devices);
  }

  async createDevice(insertDevice: InsertDevice): Promise<Device> {
    const [device] = await db.insert(devices).values(insertDevice).returning();
    return device;
  }

  async deleteDevice(id: number): Promise<void> {
    await db.delete(devices).where(eq(devices.id, id));
  }

  async updateDeviceMetrics(id: number, status: string, utilization: number, bandwidthMBps: string, lastCounter: bigint): Promise<Device> {
    const [device] = await db
      .update(devices)
      .set({ 
        status, 
        utilization,
        bandwidthMBps,
        lastCounter,
        lastCheck: new Date(),
        lastSeen: status === 'green' ? new Date() : undefined 
      })
      .where(eq(devices.id, id))
      .returning();
    return device;
  }
}

export const storage = new DatabaseStorage();
