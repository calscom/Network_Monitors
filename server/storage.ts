import { db } from "./db";
import { devices, logs, metricsHistory, users, deviceInterfaces, notificationSettings, interfaceMetricsHistory, appSettings, availabilityMonthly, availabilityAnnual, sites, type Device, type InsertDevice, type Log, type InsertLog, type MetricsHistory, type InsertMetricsHistory, type User, type DeviceInterface, type InsertDeviceInterface, type NotificationSettings, type InsertNotificationSettings, type InterfaceMetricsHistory, type InsertInterfaceMetricsHistory, type AppSettings, type AvailabilityMonthly, type InsertAvailabilityMonthly, type AvailabilityAnnual, type InsertAvailabilityAnnual, type Site, type InsertSite } from "@shared/schema";
import { eq, desc, asc, sql, and, gte, lte } from "drizzle-orm";

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
  getHistoricalMetrics(deviceId: number, hoursBack?: number, startDate?: Date, endDate?: Date): Promise<MetricsHistory[]>;
  getHistoricalAverages(deviceId: number, hoursBack?: number, startDate?: Date, endDate?: Date): Promise<{ avgUtilization: number; avgBandwidth: number }>;
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
  // Notification settings
  getNotificationSettings(): Promise<NotificationSettings | null>;
  saveNotificationSettings(settings: Partial<InsertNotificationSettings>): Promise<NotificationSettings>;
  updateLastNotificationTime(): Promise<void>;
  // Interface metrics history
  saveInterfaceMetricsSnapshot(snapshot: InsertInterfaceMetricsHistory): Promise<InterfaceMetricsHistory>;
  getInterfaceHistoricalMetrics(interfaceId: number, hoursBack?: number, startDate?: Date, endDate?: Date): Promise<InterfaceMetricsHistory[]>;
  // App settings (polling interval persistence)
  getAppSettings(): Promise<AppSettings | null>;
  savePollingInterval(intervalMs: number): Promise<AppSettings>;
  // Availability tracking (monthly/annual)
  saveMonthlyAvailability(snapshot: InsertAvailabilityMonthly): Promise<AvailabilityMonthly>;
  getMonthlyAvailability(deviceId: number, year: number): Promise<AvailabilityMonthly[]>;
  getAllMonthlyAvailabilityForYear(year: number): Promise<AvailabilityMonthly[]>;
  saveAnnualAvailability(data: InsertAvailabilityAnnual): Promise<AvailabilityAnnual>;
  getAnnualAvailability(deviceId: number, year?: number): Promise<AvailabilityAnnual[]>;
  getAllAnnualAvailability(year: number): Promise<AvailabilityAnnual[]>;
  resetDeviceAvailabilityCounters(deviceId: number): Promise<void>;
  monthlySnapshotExists(deviceId: number, year: number, month: number): Promise<boolean>;
  // Sites management
  getSites(): Promise<Site[]>;
  createSite(site: InsertSite): Promise<Site>;
  updateSite(id: number, name: string): Promise<Site>;
  renameSiteWithDevices(id: number, oldName: string, newName: string): Promise<Site>;
  bulkImportSites(siteNames: string[], replaceAll?: boolean): Promise<Site[]>;
  deleteSite(id: number): Promise<void>;
  reorderSites(siteIds: number[]): Promise<void>;
  initializeDefaultSites(): Promise<void>;
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

  async getHistoricalMetrics(deviceId: number, hoursBack: number = 24, startDate?: Date, endDate?: Date): Promise<MetricsHistory[]> {
    // Use custom range if provided, otherwise fall back to hoursBack
    const since = startDate || new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const until = endDate || new Date();
    const rangeHours = (until.getTime() - since.getTime()) / (1000 * 60 * 60);
    
    // For large time ranges, use time-based bucketing to sample data evenly
    // This ensures charts show the full requested range, not just recent data
    if (rangeHours > 168) { // More than 7 days
      // Determine bucket interval based on range (valid date_trunc units)
      // Use sql.raw() to insert literal SQL for the unit since date_trunc requires a literal string
      const bucketUnit = rangeHours > 720 ? sql.raw(`'day'`) : sql.raw(`'hour'`);
      
      const bucketedData = await db.execute(sql`
        SELECT 
          MIN(id) as id,
          ${deviceId} as device_id,
          MAX(site) as site,
          ROUND(AVG(utilization))::integer as utilization,
          ROUND(AVG(CAST(bandwidth_mbps AS DECIMAL)), 2)::text as bandwidth_mbps,
          ROUND(AVG(CAST(download_mbps AS DECIMAL)), 2)::text as download_mbps,
          ROUND(AVG(CAST(upload_mbps AS DECIMAL)), 2)::text as upload_mbps,
          date_trunc(${bucketUnit}, timestamp) as timestamp
        FROM metrics_history
        WHERE device_id = ${deviceId}
          AND timestamp >= ${since}
          AND timestamp <= ${until}
        GROUP BY date_trunc(${bucketUnit}, timestamp)
        ORDER BY timestamp ASC
      `);
      
      return (bucketedData.rows as any[]).map(row => ({
        id: row.id,
        deviceId: row.device_id,
        site: row.site || '',
        utilization: row.utilization || 0,
        bandwidthMBps: row.bandwidth_mbps || '0',
        downloadMbps: row.download_mbps || '0',
        uploadMbps: row.upload_mbps || '0',
        timestamp: new Date(row.timestamp)
      }));
    }
    
    // For smaller ranges (<=7 days), return all raw data ordered by time ascending
    // The time filter naturally limits the data volume for these ranges
    return await db
      .select()
      .from(metricsHistory)
      .where(and(
        eq(metricsHistory.deviceId, deviceId),
        gte(metricsHistory.timestamp, since),
        lte(metricsHistory.timestamp, until)
      ))
      .orderBy(asc(metricsHistory.timestamp));
  }

  async getHistoricalAverages(deviceId: number, hoursBack: number = 24, startDate?: Date, endDate?: Date): Promise<{ avgUtilization: number; avgBandwidth: number }> {
    const since = startDate || new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const until = endDate || new Date();
    const result = await db
      .select({
        avgUtilization: sql<number>`COALESCE(AVG(${metricsHistory.utilization}), 0)`,
        avgBandwidth: sql<number>`COALESCE(AVG(CAST(${metricsHistory.bandwidthMBps} AS DECIMAL)), 0)`
      })
      .from(metricsHistory)
      .where(and(
        eq(metricsHistory.deviceId, deviceId),
        gte(metricsHistory.timestamp, since),
        lte(metricsHistory.timestamp, until)
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

  async getNotificationSettings(): Promise<NotificationSettings | null> {
    const [settings] = await db.select().from(notificationSettings).limit(1);
    return settings || null;
  }

  async saveNotificationSettings(settings: Partial<InsertNotificationSettings>): Promise<NotificationSettings> {
    // Check if settings exist
    const existing = await this.getNotificationSettings();
    
    // Default values for required fields
    const defaults: InsertNotificationSettings = {
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
    };
    
    if (existing) {
      const [updated] = await db
        .update(notificationSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(notificationSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      // Merge with defaults for first insert
      const fullSettings = { ...defaults, ...settings };
      const [created] = await db
        .insert(notificationSettings)
        .values(fullSettings)
        .returning();
      return created;
    }
  }

  async updateLastNotificationTime(): Promise<void> {
    const existing = await this.getNotificationSettings();
    if (existing) {
      await db
        .update(notificationSettings)
        .set({ lastNotificationAt: new Date() })
        .where(eq(notificationSettings.id, existing.id));
    }
  }

  async saveInterfaceMetricsSnapshot(snapshot: InsertInterfaceMetricsHistory): Promise<InterfaceMetricsHistory> {
    const [record] = await db.insert(interfaceMetricsHistory).values(snapshot).returning();
    return record;
  }

  async getInterfaceHistoricalMetrics(interfaceId: number, hoursBack: number = 24, startDate?: Date, endDate?: Date): Promise<InterfaceMetricsHistory[]> {
    // Use custom range if provided, otherwise fall back to hoursBack
    const since = startDate || new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const until = endDate || new Date();
    const rangeHours = (until.getTime() - since.getTime()) / (1000 * 60 * 60);
    
    // For large time ranges, use time-based bucketing to sample data evenly
    // This ensures charts show the full requested range, not just recent data
    if (rangeHours > 168) { // More than 7 days
      // Determine bucket interval based on range (valid date_trunc units)
      // Use sql.raw() to insert literal SQL for the unit since date_trunc requires a literal string
      const bucketUnit = rangeHours > 720 ? sql.raw(`'day'`) : sql.raw(`'hour'`);
      
      const bucketedData = await db.execute(sql`
        SELECT 
          MIN(id) as id,
          ${interfaceId} as interface_id,
          MAX(device_id) as device_id,
          MAX(site) as site,
          MAX(interface_name) as interface_name,
          ROUND(AVG(utilization))::integer as utilization,
          ROUND(AVG(CAST(download_mbps AS DECIMAL)), 2)::text as download_mbps,
          ROUND(AVG(CAST(upload_mbps AS DECIMAL)), 2)::text as upload_mbps,
          date_trunc(${bucketUnit}, timestamp) as timestamp
        FROM interface_metrics_history
        WHERE interface_id = ${interfaceId}
          AND timestamp >= ${since}
          AND timestamp <= ${until}
        GROUP BY date_trunc(${bucketUnit}, timestamp)
        ORDER BY timestamp ASC
      `);
      
      return (bucketedData.rows as any[]).map(row => ({
        id: row.id,
        interfaceId: row.interface_id,
        deviceId: row.device_id,
        site: row.site || '',
        interfaceName: row.interface_name || null,
        utilization: row.utilization || 0,
        downloadMbps: row.download_mbps || '0',
        uploadMbps: row.upload_mbps || '0',
        timestamp: new Date(row.timestamp)
      }));
    }
    
    // For smaller ranges (<=7 days), return all raw data ordered by time ascending
    // The time filter naturally limits the data volume for these ranges
    const records = await db
      .select()
      .from(interfaceMetricsHistory)
      .where(
        and(
          eq(interfaceMetricsHistory.interfaceId, interfaceId),
          gte(interfaceMetricsHistory.timestamp, since),
          lte(interfaceMetricsHistory.timestamp, until)
        )
      )
      .orderBy(asc(interfaceMetricsHistory.timestamp));
    
    return records;
  }

  async getAppSettings(): Promise<AppSettings | null> {
    const [settings] = await db.select().from(appSettings).limit(1);
    return settings || null;
  }

  async savePollingInterval(intervalMs: number): Promise<AppSettings> {
    const existing = await this.getAppSettings();
    
    if (existing) {
      const [updated] = await db
        .update(appSettings)
        .set({ pollingIntervalMs: intervalMs, updatedAt: new Date() })
        .where(eq(appSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(appSettings)
        .values({ pollingIntervalMs: intervalMs })
        .returning();
      return created;
    }
  }

  // Availability tracking methods
  async saveMonthlyAvailability(snapshot: InsertAvailabilityMonthly): Promise<AvailabilityMonthly> {
    const [record] = await db.insert(availabilityMonthly).values(snapshot).returning();
    return record;
  }

  async getMonthlyAvailability(deviceId: number, year: number): Promise<AvailabilityMonthly[]> {
    return await db
      .select()
      .from(availabilityMonthly)
      .where(and(
        eq(availabilityMonthly.deviceId, deviceId),
        eq(availabilityMonthly.year, year)
      ))
      .orderBy(asc(availabilityMonthly.month));
  }

  async getAllMonthlyAvailabilityForYear(year: number): Promise<AvailabilityMonthly[]> {
    return await db
      .select()
      .from(availabilityMonthly)
      .where(eq(availabilityMonthly.year, year))
      .orderBy(asc(availabilityMonthly.deviceId), asc(availabilityMonthly.month));
  }

  async saveAnnualAvailability(data: InsertAvailabilityAnnual): Promise<AvailabilityAnnual> {
    // Check if record exists for this device/year
    const existing = await db
      .select()
      .from(availabilityAnnual)
      .where(and(
        eq(availabilityAnnual.deviceId, data.deviceId),
        eq(availabilityAnnual.year, data.year)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing record
      const [updated] = await db
        .update(availabilityAnnual)
        .set({
          totalChecks: data.totalChecks,
          successfulChecks: data.successfulChecks,
          uptimePercentage: data.uptimePercentage,
          monthsRecorded: data.monthsRecorded,
          compiledAt: new Date()
        })
        .where(eq(availabilityAnnual.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [record] = await db.insert(availabilityAnnual).values(data).returning();
      return record;
    }
  }

  async getAnnualAvailability(deviceId: number, year?: number): Promise<AvailabilityAnnual[]> {
    if (year) {
      return await db
        .select()
        .from(availabilityAnnual)
        .where(and(
          eq(availabilityAnnual.deviceId, deviceId),
          eq(availabilityAnnual.year, year)
        ));
    }
    return await db
      .select()
      .from(availabilityAnnual)
      .where(eq(availabilityAnnual.deviceId, deviceId))
      .orderBy(desc(availabilityAnnual.year));
  }

  async getAllAnnualAvailability(year: number): Promise<AvailabilityAnnual[]> {
    return await db
      .select()
      .from(availabilityAnnual)
      .where(eq(availabilityAnnual.year, year))
      .orderBy(asc(availabilityAnnual.deviceId));
  }

  async resetDeviceAvailabilityCounters(deviceId: number): Promise<void> {
    await db
      .update(devices)
      .set({ totalChecks: 0, successfulChecks: 0 })
      .where(eq(devices.id, deviceId));
  }

  async monthlySnapshotExists(deviceId: number, year: number, month: number): Promise<boolean> {
    const existing = await db
      .select()
      .from(availabilityMonthly)
      .where(and(
        eq(availabilityMonthly.deviceId, deviceId),
        eq(availabilityMonthly.year, year),
        eq(availabilityMonthly.month, month)
      ))
      .limit(1);
    return existing.length > 0;
  }

  // Sites management methods
  async getSites(): Promise<Site[]> {
    return await db.select().from(sites).orderBy(asc(sites.displayOrder), asc(sites.id));
  }

  async createSite(site: InsertSite): Promise<Site> {
    const [newSite] = await db.insert(sites).values(site).returning();
    return newSite;
  }

  async updateSite(id: number, name: string): Promise<Site> {
    const [updated] = await db
      .update(sites)
      .set({ name })
      .where(eq(sites.id, id))
      .returning();
    return updated;
  }

  async renameSiteWithDevices(id: number, oldName: string, newName: string): Promise<Site> {
    // Update site name
    const [updated] = await db
      .update(sites)
      .set({ name: newName })
      .where(eq(sites.id, id))
      .returning();
    
    // Update all devices with the old site name to the new name
    await db
      .update(devices)
      .set({ site: newName })
      .where(eq(devices.site, oldName));
    
    return updated;
  }

  async bulkImportSites(siteNames: string[], replaceAll: boolean = false): Promise<Site[]> {
    const existingSites = await this.getSites();
    const existingNames = new Set(existingSites.map(s => s.name));
    
    if (replaceAll) {
      // Only delete sites that are not in the import list AND have no devices
      const devicesData = await db.select().from(devices);
      const siteNamesSet = new Set(siteNames);
      
      for (const site of existingSites) {
        if (!siteNamesSet.has(site.name)) {
          // Check if any devices use this site
          const hasDevices = devicesData.some(d => d.site === site.name);
          if (!hasDevices) {
            await db.delete(sites).where(eq(sites.id, site.id));
          }
          // If has devices, keep the site to avoid orphaning
        }
      }
    }
    
    // Add new sites that don't exist yet
    const maxOrder = existingSites.length > 0 
      ? Math.max(...existingSites.map(s => s.displayOrder)) + 1 
      : 0;
    
    let orderOffset = 0;
    for (const name of siteNames) {
      if (!existingNames.has(name)) {
        await db.insert(sites).values({
          name: name,
          displayOrder: maxOrder + orderOffset
        });
        orderOffset++;
      }
    }
    
    // Return updated list
    return await this.getSites();
  }

  async deleteSite(id: number): Promise<void> {
    await db.delete(sites).where(eq(sites.id, id));
  }

  async reorderSites(siteIds: number[]): Promise<void> {
    // Update display order for each site
    for (let i = 0; i < siteIds.length; i++) {
      await db
        .update(sites)
        .set({ displayOrder: i })
        .where(eq(sites.id, siteIds[i]));
    }
  }

  async initializeDefaultSites(): Promise<void> {
    // Check if sites table is empty
    const existingSites = await db.select().from(sites).limit(1);
    if (existingSites.length > 0) {
      return; // Sites already exist, don't reinitialize
    }

    // Default sites list
    const defaultSiteNames = [
      "01 Cloud",
      "02-Maiduguri", 
      "03 Biu",
      "04 Damaturu",
      "05 Gombe",
      "06 Bauchi",
      "07 Jos",
      "08 Jalingo",
      "09 Yola",
      "10 Numan",
      "11 Abuja",
      "12 Makurdi"
    ];

    // Insert default sites with display order
    for (let i = 0; i < defaultSiteNames.length; i++) {
      await db.insert(sites).values({
        name: defaultSiteNames[i],
        displayOrder: i
      });
    }
    console.log("[storage] Initialized default sites");
  }
}

export const storage = new DatabaseStorage();
