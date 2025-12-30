import { db } from "./db";
import { devices, logs, metricsHistory, type Device, type InsertDevice, type Log, type InsertLog, type MetricsHistory, type InsertMetricsHistory } from "@shared/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";

export interface IStorage {
  getDevices(): Promise<Device[]>;
  createDevice(device: InsertDevice): Promise<Device>;
  deleteDevice(id: number): Promise<void>;
  updateDeviceMetrics(id: number, metrics: { 
    status: string; 
    utilization: number; 
    bandwidthMBps: string; 
    downloadMbps: string;
    uploadMbps: string;
    lastInCounter: bigint;
    lastOutCounter: bigint;
  }): Promise<Device>;
  updateDevice(id: number, device: Partial<InsertDevice>): Promise<Device>;
  updateDevicesSite(fromSite: string, toSite: string): Promise<number>;
  getLogs(site?: string): Promise<Log[]>;
  createLog(log: InsertLog): Promise<Log>;
  saveMetricsSnapshot(snapshot: InsertMetricsHistory): Promise<MetricsHistory>;
  getHistoricalMetrics(deviceId: number, hoursBack?: number): Promise<MetricsHistory[]>;
  getHistoricalAverages(deviceId: number, hoursBack?: number): Promise<{ avgUtilization: number; avgBandwidth: number }>;
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

  async updateDeviceMetrics(id: number, metrics: { 
    status: string; 
    utilization: number; 
    bandwidthMBps: string;
    downloadMbps: string;
    uploadMbps: string;
    lastInCounter: bigint;
    lastOutCounter: bigint;
  }): Promise<Device> {
    const [device] = await db
      .update(devices)
      .set({ 
        status: metrics.status,
        utilization: metrics.utilization,
        bandwidthMBps: metrics.bandwidthMBps,
        downloadMbps: metrics.downloadMbps,
        uploadMbps: metrics.uploadMbps,
        lastInCounter: metrics.lastInCounter,
        lastOutCounter: metrics.lastOutCounter,
        lastCheck: new Date(),
        lastSeen: metrics.status === 'green' ? new Date() : undefined 
      })
      .where(eq(devices.id, id))
      .returning();
    return device;
  }

  async updateDevice(id: number, update: Partial<InsertDevice>): Promise<Device> {
    const [device] = await db
      .update(devices)
      .set({
        ...update,
        lastCheck: new Date()
      })
      .where(eq(devices.id, id))
      .returning();
    
    if (!device) {
      throw new Error("Device not found");
    }
    return device;
  }

  async updateDevicesSite(fromSite: string, toSite: string): Promise<number> {
    const result = await db
      .update(devices)
      .set({ site: toSite })
      .where(eq(devices.site, fromSite))
      .returning();
    return result.length;
  }

  async getLogs(site?: string): Promise<Log[]> {
    let query = db.select().from(logs);
    if (site) {
      // @ts-ignore
      return await query.where(eq(logs.site, site)).orderBy(desc(logs.timestamp)).limit(50);
    }
    return await query.orderBy(desc(logs.timestamp)).limit(100);
  }

  async createLog(insertLog: InsertLog): Promise<Log> {
    const [log] = await db.insert(logs).values(insertLog).returning();
    return log;
  }

  async saveMetricsSnapshot(snapshot: InsertMetricsHistory): Promise<MetricsHistory> {
    const [record] = await db.insert(metricsHistory).values(snapshot).returning();
    return record;
  }

  async getHistoricalMetrics(deviceId: number, hoursBack: number = 24): Promise<MetricsHistory[]> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    return await db
      .select()
      .from(metricsHistory)
      .where(and(
        eq(metricsHistory.deviceId, deviceId),
        gte(metricsHistory.timestamp, since)
      ))
      .orderBy(desc(metricsHistory.timestamp))
      .limit(500);
  }

  async getHistoricalAverages(deviceId: number, hoursBack: number = 24): Promise<{ avgUtilization: number; avgBandwidth: number }> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const result = await db
      .select({
        avgUtilization: sql<number>`COALESCE(AVG(${metricsHistory.utilization}), 0)`,
        avgBandwidth: sql<number>`COALESCE(AVG(CAST(${metricsHistory.bandwidthMBps} AS DECIMAL)), 0)`
      })
      .from(metricsHistory)
      .where(and(
        eq(metricsHistory.deviceId, deviceId),
        gte(metricsHistory.timestamp, since)
      ));
    
    return {
      avgUtilization: Math.round(result[0]?.avgUtilization || 0),
      avgBandwidth: parseFloat((result[0]?.avgBandwidth || 0).toFixed(2))
    };
  }
}

export const storage = new DatabaseStorage();
