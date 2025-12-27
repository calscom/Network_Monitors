import { db } from "./db";
import { devices, sites, type Device, type InsertDevice, type Site, type InsertSite } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  getSites(): Promise<Site[]>;
  getSiteByName(name: string): Promise<Site | undefined>;
  createSite(site: InsertSite): Promise<Site>;
  
  getDevices(siteId?: number): Promise<Device[]>;
  createDevice(device: InsertDevice): Promise<Device>;
  deleteDevice(id: number): Promise<void>;
  updateDeviceMetrics(id: number, metrics: Partial<Device>): Promise<Device>;
}

export class DatabaseStorage implements IStorage {
  async getSites(): Promise<Site[]> {
    return await db.select().from(sites).orderBy(sites.name);
  }

  async getSiteByName(name: string): Promise<Site | undefined> {
    const [site] = await db.select().from(sites).where(eq(sites.name, name));
    return site;
  }

  async createSite(insertSite: InsertSite): Promise<Site> {
    const [site] = await db.insert(sites).values(insertSite).returning();
    return site;
  }

  async getDevices(siteId?: number): Promise<Device[]> {
    if (siteId) {
      return await db.select().from(devices).where(eq(devices.siteId, siteId));
    }
    return await db.select().from(devices);
  }

  async createDevice(insertDevice: InsertDevice): Promise<Device> {
    const [device] = await db.insert(devices).values(insertDevice).returning();
    return device;
  }

  async deleteDevice(id: number): Promise<void> {
    await db.delete(devices).where(eq(devices.id, id));
  }

  async updateDeviceMetrics(id: number, metrics: Partial<Device>): Promise<Device> {
    const [device] = await db
      .update(devices)
      .set({ 
        ...metrics,
        lastCheck: new Date(),
        ...(metrics.status === 'green' ? { lastSeen: new Date() } : {})
      })
      .where(eq(devices.id, id))
      .returning();
    return device;
  }
}

export const storage = new DatabaseStorage();
