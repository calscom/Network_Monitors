import { db } from "./db";
import { devices, logs, metricsHistory, users, deviceInterfaces, type Device, type InsertDevice, type Log, type InsertLog, type MetricsHistory, type InsertMetricsHistory, type User, type DeviceInterface, type InsertDeviceInterface } from "@shared/schema";
import { eq, desc, asc, sql, and, gte } from "drizzle-orm";

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
    totalChecks: number;
    successfulChecks: number;
    activeUsers?: number;
  }): Promise<Device>;
  updateDevice(id: number, device: Partial<InsertDevice>): Promise<Device>;
  updateDevicesSite(fromSite: string, toSite: string): Promise<number>;
  getLogs(site?: string): Promise<Log[]>;
  createLog(log: InsertLog): Promise<Log>;
  saveMetricsSnapshot(snapshot: InsertMetricsHistory): Promise<MetricsHistory>;
  getHistoricalMetrics(deviceId: number, hoursBack?: number): Promise<MetricsHistory[]>;
  getHistoricalAverages(deviceId: number, hoursBack?: number): Promise<{ avgUtilization: number; avgBandwidth: number }>;
  // User management
  getAllUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: string): Promise<User | null>;
  // Device interfaces
  getDeviceInterfaces(deviceId: number): Promise<DeviceInterface[]>;
  addDeviceInterface(iface: InsertDeviceInterface): Promise<DeviceInterface>;
  removeDeviceInterface(id: number): Promise<void>;
  updateDeviceInterfaceMetrics(id: number, metrics: {
    status: string;
    utilization: number;
    downloadMbps: string;
    uploadMbps: string;
    lastInCounter: bigint;
    lastOutCounter: bigint;
  }): Promise<DeviceInterface>;
  setDeviceInterfaces(deviceId: number, interfaces: InsertDeviceInterface[]): Promise<DeviceInterface[]>;
}

export class DatabaseStorage implements IStorage {
  async getDevices(): Promise<Device[]> {
    // Sort by site then by id for stable ordering (prevents card position changes on status updates)
    return await db.select().from(devices).orderBy(asc(devices.site), asc(devices.id));
  }

  async createDevice(insertDevice: InsertDevice): Promise<Device> {
    const [device] = await db.insert(devices).values(insertDevice).returning();
    return device;
  }

  async deleteDevice(id: number): Promise<void> {
    // Delete related records first (foreign key constraints)
    await db.delete(deviceInterfaces).where(eq(deviceInterfaces.deviceId, id));
    await db.delete(metricsHistory).where(eq(metricsHistory.deviceId, id));
    await db.delete(logs).where(eq(logs.deviceId, id));
    // Now delete the device
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
    totalChecks: number;
    successfulChecks: number;
    activeUsers?: number;
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
        totalChecks: metrics.totalChecks,
        successfulChecks: metrics.successfulChecks,
        activeUsers: metrics.activeUsers ?? 0,
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
    
    const avgUtil = Number(result[0]?.avgUtilization) || 0;
    const avgBw = Number(result[0]?.avgBandwidth) || 0;
    return {
      avgUtilization: Math.round(avgUtil),
      avgBandwidth: parseFloat(avgBw.toFixed(2))
    };
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRole(userId: string, role: string): Promise<User | null> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user || null;
  }

  // Device interfaces methods
  async getDeviceInterfaces(deviceId: number): Promise<DeviceInterface[]> {
    return await db
      .select()
      .from(deviceInterfaces)
      .where(eq(deviceInterfaces.deviceId, deviceId))
      .orderBy(desc(deviceInterfaces.isPrimary), asc(deviceInterfaces.interfaceIndex));
  }

  async addDeviceInterface(iface: InsertDeviceInterface): Promise<DeviceInterface> {
    const [result] = await db.insert(deviceInterfaces).values(iface).returning();
    return result;
  }

  async removeDeviceInterface(id: number): Promise<void> {
    await db.delete(deviceInterfaces).where(eq(deviceInterfaces.id, id));
  }

  async updateDeviceInterfaceMetrics(id: number, metrics: {
    status: string;
    utilization: number;
    downloadMbps: string;
    uploadMbps: string;
    lastInCounter: bigint;
    lastOutCounter: bigint;
  }): Promise<DeviceInterface> {
    const [result] = await db
      .update(deviceInterfaces)
      .set({
        status: metrics.status,
        utilization: metrics.utilization,
        downloadMbps: metrics.downloadMbps,
        uploadMbps: metrics.uploadMbps,
        lastInCounter: metrics.lastInCounter,
        lastOutCounter: metrics.lastOutCounter,
        lastCheck: new Date(),
      })
      .where(eq(deviceInterfaces.id, id))
      .returning();
    return result;
  }

  async setDeviceInterfaces(deviceId: number, interfaces: InsertDeviceInterface[]): Promise<DeviceInterface[]> {
    // Delete existing interfaces for this device
    await db.delete(deviceInterfaces).where(eq(deviceInterfaces.deviceId, deviceId));
    
    if (interfaces.length === 0) {
      return [];
    }
    
    // Insert new interfaces
    const results = await db.insert(deviceInterfaces).values(interfaces).returning();
    return results;
  }
}

export const storage = new DatabaseStorage();
