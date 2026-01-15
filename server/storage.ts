import { db } from "./db";
import { devices, logs, metricsHistory, users, deviceInterfaces, notificationSettings, interfaceMetricsHistory, appSettings, availabilityMonthly, availabilityAnnual, sites, interfaceAvailabilityMonthly, interfaceAvailabilityAnnual, deviceLinks, type Device, type InsertDevice, type Log, type InsertLog, type MetricsHistory, type InsertMetricsHistory, type User, type DeviceInterface, type InsertDeviceInterface, type NotificationSettings, type InsertNotificationSettings, type InterfaceMetricsHistory, type InsertInterfaceMetricsHistory, type AppSettings, type AvailabilityMonthly, type InsertAvailabilityMonthly, type AvailabilityAnnual, type InsertAvailabilityAnnual, type Site, type InsertSite, type InterfaceAvailabilityMonthly, type InsertInterfaceAvailabilityMonthly, type InterfaceAvailabilityAnnual, type InsertInterfaceAvailabilityAnnual, type DeviceLink, type InsertDeviceLink } from "@shared/schema";
import { eq, desc, asc, sql, and, gte, lte, or } from "drizzle-orm";

export interface IStorage {
  getDevices(): Promise<Device[]>;
  getDevice(id: number): Promise<Device | null>;
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
  // Interface availability tracking
  saveInterfaceMonthlyAvailability(snapshot: InsertInterfaceAvailabilityMonthly): Promise<InterfaceAvailabilityMonthly>;
  getInterfaceMonthlyAvailability(interfaceId: number, year: number): Promise<InterfaceAvailabilityMonthly[]>;
  getAllInterfaceMonthlyAvailabilityForYear(year: number): Promise<InterfaceAvailabilityMonthly[]>;
  saveInterfaceAnnualAvailability(data: InsertInterfaceAvailabilityAnnual): Promise<InterfaceAvailabilityAnnual>;
  getInterfaceAnnualAvailability(interfaceId: number, year?: number): Promise<InterfaceAvailabilityAnnual[]>;
  getAllInterfaceAnnualAvailability(year: number): Promise<InterfaceAvailabilityAnnual[]>;
  resetInterfaceAvailabilityCounters(interfaceId: number): Promise<void>;
  interfaceMonthlySnapshotExists(interfaceId: number, year: number, month: number): Promise<boolean>;
  updateInterfaceAvailabilityMetrics(id: number, totalChecks: number, successfulChecks: number): Promise<DeviceInterface>;
  // Device links management
  getDeviceLinks(): Promise<DeviceLink[]>;
  getDeviceLinksByDevice(deviceId: number): Promise<DeviceLink[]>;
  createDeviceLink(link: InsertDeviceLink): Promise<DeviceLink>;
  updateDeviceLink(id: number, updates: Partial<InsertDeviceLink>): Promise<DeviceLink>;
  updateDeviceLinkTraffic(id: number, trafficMbps: string, status: string): Promise<DeviceLink>;
  deleteDeviceLink(id: number): Promise<void>;
  autoDiscoverLinks(): Promise<DeviceLink[]>;
}

export class DatabaseStorage implements IStorage {
  async getDevices(): Promise<Device[]> {
    // Sort by site then by id for stable ordering (prevents card position changes on status updates)
    return await db.select().from(devices).orderBy(asc(devices.site), asc(devices.id));
  }

  async getDevice(id: number): Promise<Device | null> {
    const [device] = await db.select().from(devices).where(eq(devices.id, id));
    return device || null;
  }

  async createDevice(insertDevice: InsertDevice): Promise<Device> {
    const [device] = await db.insert(devices).values(insertDevice).returning();
    return device;
  }

  async deleteDevice(id: number): Promise<void> {
    // Use raw SQL for reliable cascading delete - handles all foreign key constraints
    // Delete interface-related records using subquery
    await db.execute(sql`
      DELETE FROM interface_metrics_history 
      WHERE interface_id IN (SELECT id FROM device_interfaces WHERE device_id = ${id})
    `);
    await db.execute(sql`
      DELETE FROM interface_availability_monthly 
      WHERE interface_id IN (SELECT id FROM device_interfaces WHERE device_id = ${id})
    `);
    await db.execute(sql`
      DELETE FROM interface_availability_annual 
      WHERE interface_id IN (SELECT id FROM device_interfaces WHERE device_id = ${id})
    `);
    
    // Delete device interfaces
    await db.execute(sql`DELETE FROM device_interfaces WHERE device_id = ${id}`);
    
    // Delete metrics history
    await db.execute(sql`DELETE FROM metrics_history WHERE device_id = ${id}`);
    
    // Delete logs referencing this device
    await db.execute(sql`DELETE FROM logs WHERE device_id = ${id}`);
    
    // Delete device links (source or target)
    await db.execute(sql`DELETE FROM device_links WHERE source_device_id = ${id} OR target_device_id = ${id}`);
    
    // Delete availability records
    await db.execute(sql`DELETE FROM availability_monthly WHERE device_id = ${id}`);
    await db.execute(sql`DELETE FROM availability_annual WHERE device_id = ${id}`);
    
    // Finally delete the device
    await db.execute(sql`DELETE FROM devices WHERE id = ${id}`);
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

  // Interface availability tracking methods
  async saveInterfaceMonthlyAvailability(snapshot: InsertInterfaceAvailabilityMonthly): Promise<InterfaceAvailabilityMonthly> {
    const [record] = await db.insert(interfaceAvailabilityMonthly).values(snapshot).returning();
    return record;
  }

  async getInterfaceMonthlyAvailability(interfaceId: number, year: number): Promise<InterfaceAvailabilityMonthly[]> {
    return await db
      .select()
      .from(interfaceAvailabilityMonthly)
      .where(and(
        eq(interfaceAvailabilityMonthly.interfaceId, interfaceId),
        eq(interfaceAvailabilityMonthly.year, year)
      ))
      .orderBy(asc(interfaceAvailabilityMonthly.month));
  }

  async getAllInterfaceMonthlyAvailabilityForYear(year: number): Promise<InterfaceAvailabilityMonthly[]> {
    return await db
      .select()
      .from(interfaceAvailabilityMonthly)
      .where(eq(interfaceAvailabilityMonthly.year, year))
      .orderBy(asc(interfaceAvailabilityMonthly.interfaceId), asc(interfaceAvailabilityMonthly.month));
  }

  async saveInterfaceAnnualAvailability(data: InsertInterfaceAvailabilityAnnual): Promise<InterfaceAvailabilityAnnual> {
    const existing = await db
      .select()
      .from(interfaceAvailabilityAnnual)
      .where(and(
        eq(interfaceAvailabilityAnnual.interfaceId, data.interfaceId),
        eq(interfaceAvailabilityAnnual.year, data.year)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db
        .update(interfaceAvailabilityAnnual)
        .set({
          totalChecks: data.totalChecks,
          successfulChecks: data.successfulChecks,
          uptimePercentage: data.uptimePercentage,
          monthsRecorded: data.monthsRecorded,
          compiledAt: new Date()
        })
        .where(eq(interfaceAvailabilityAnnual.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [record] = await db.insert(interfaceAvailabilityAnnual).values(data).returning();
      return record;
    }
  }

  async getInterfaceAnnualAvailability(interfaceId: number, year?: number): Promise<InterfaceAvailabilityAnnual[]> {
    if (year) {
      return await db
        .select()
        .from(interfaceAvailabilityAnnual)
        .where(and(
          eq(interfaceAvailabilityAnnual.interfaceId, interfaceId),
          eq(interfaceAvailabilityAnnual.year, year)
        ));
    }
    return await db
      .select()
      .from(interfaceAvailabilityAnnual)
      .where(eq(interfaceAvailabilityAnnual.interfaceId, interfaceId))
      .orderBy(desc(interfaceAvailabilityAnnual.year));
  }

  async getAllInterfaceAnnualAvailability(year: number): Promise<InterfaceAvailabilityAnnual[]> {
    return await db
      .select()
      .from(interfaceAvailabilityAnnual)
      .where(eq(interfaceAvailabilityAnnual.year, year))
      .orderBy(asc(interfaceAvailabilityAnnual.interfaceId));
  }

  async resetInterfaceAvailabilityCounters(interfaceId: number): Promise<void> {
    await db
      .update(deviceInterfaces)
      .set({ totalChecks: 0, successfulChecks: 0 })
      .where(eq(deviceInterfaces.id, interfaceId));
  }

  async interfaceMonthlySnapshotExists(interfaceId: number, year: number, month: number): Promise<boolean> {
    const existing = await db
      .select()
      .from(interfaceAvailabilityMonthly)
      .where(and(
        eq(interfaceAvailabilityMonthly.interfaceId, interfaceId),
        eq(interfaceAvailabilityMonthly.year, year),
        eq(interfaceAvailabilityMonthly.month, month)
      ))
      .limit(1);
    return existing.length > 0;
  }

  async updateInterfaceAvailabilityMetrics(id: number, totalChecks: number, successfulChecks: number): Promise<DeviceInterface> {
    const [result] = await db
      .update(deviceInterfaces)
      .set({ totalChecks, successfulChecks })
      .where(eq(deviceInterfaces.id, id))
      .returning();
    return result;
  }

  // Device links management methods
  async getDeviceLinks(): Promise<DeviceLink[]> {
    return await db.select().from(deviceLinks).orderBy(asc(deviceLinks.id));
  }

  async getDeviceLinksByDevice(deviceId: number): Promise<DeviceLink[]> {
    return await db
      .select()
      .from(deviceLinks)
      .where(or(
        eq(deviceLinks.sourceDeviceId, deviceId),
        eq(deviceLinks.targetDeviceId, deviceId)
      ))
      .orderBy(asc(deviceLinks.id));
  }

  async createDeviceLink(link: InsertDeviceLink): Promise<DeviceLink> {
    const [newLink] = await db.insert(deviceLinks).values(link).returning();
    return newLink;
  }

  async updateDeviceLink(id: number, updates: Partial<InsertDeviceLink>): Promise<DeviceLink> {
    const [updated] = await db
      .update(deviceLinks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(deviceLinks.id, id))
      .returning();
    return updated;
  }

  async updateDeviceLinkTraffic(id: number, trafficMbps: string, status: string): Promise<DeviceLink> {
    const [updated] = await db
      .update(deviceLinks)
      .set({ 
        currentTrafficMbps: trafficMbps, 
        status, 
        lastCheck: new Date(),
        updatedAt: new Date()
      })
      .where(eq(deviceLinks.id, id))
      .returning();
    return updated;
  }

  async deleteDeviceLink(id: number): Promise<void> {
    await db.delete(deviceLinks).where(eq(deviceLinks.id, id));
  }

  async autoDiscoverLinks(): Promise<DeviceLink[]> {
    // Enhanced auto-discovery based on device naming hierarchy patterns:
    // ISP-PE → ISP-CE → FW-01 → RTR-01 → DST-01 → ACC-01-09 → UniFi APs
    const allDevices = await this.getDevices();
    const existingLinks = await this.getDeviceLinks();
    
    const newLinks: DeviceLink[] = [];
    
    // Helper to check if device name matches a pattern
    const matchesPattern = (name: string, patterns: string[]): boolean => {
      const upperName = name.toUpperCase();
      return patterns.some(p => upperName.includes(p) || upperName.startsWith(p));
    };
    
    // Helper to check if link already exists
    const linkExists = (sourceId: number, targetId: number): boolean => {
      return existingLinks.some(l => 
        (l.sourceDeviceId === sourceId && l.targetDeviceId === targetId) ||
        (l.sourceDeviceId === targetId && l.targetDeviceId === sourceId)
      ) || newLinks.some(l =>
        (l.sourceDeviceId === sourceId && l.targetDeviceId === targetId) ||
        (l.sourceDeviceId === targetId && l.targetDeviceId === sourceId)
      );
    };
    
    // Group devices by site
    const devicesBySite: Record<string, Device[]> = {};
    for (const device of allDevices) {
      if (!devicesBySite[device.site]) {
        devicesBySite[device.site] = [];
      }
      devicesBySite[device.site].push(device);
    }
    
    // For each site, create hierarchical links
    for (const site of Object.keys(devicesBySite)) {
      const siteDevices = devicesBySite[site];
      if (siteDevices.length < 2) continue;
      
      // Categorize devices by naming pattern
      const ispPE = siteDevices.filter(d => matchesPattern(d.name, ['ISP-PE', 'ISP_PE', 'ISPPE']));
      const ispCE = siteDevices.filter(d => matchesPattern(d.name, ['ISP-CE', 'ISP_CE', 'ISPCE']));
      const firewalls = siteDevices.filter(d => matchesPattern(d.name, ['FW-', 'FW_', 'FW0', 'FW1']));
      const routers = siteDevices.filter(d => matchesPattern(d.name, ['RTR-', 'RTR_', 'RTR0', 'RTR1']));
      const distribution = siteDevices.filter(d => matchesPattern(d.name, ['DST-', 'DST_', 'DTS-', 'DTS_', 'DST0', 'DTS0']));
      const accessSwitches = siteDevices.filter(d => matchesPattern(d.name, ['ACC-', 'ACC_', 'ACC0']));
      const accessPoints = siteDevices.filter(d => 
        d.type === 'unifi' || d.type === 'ap' || d.type === 'access_point' ||
        matchesPattern(d.name, ['UAP-', 'UAP_', 'AP-', 'AP_', 'UNIFI'])
      );
      
      // Create hierarchy links: ISP-PE → ISP-CE
      for (const pe of ispPE) {
        for (const ce of ispCE) {
          if (!linkExists(pe.id, ce.id)) {
            const link = await this.createDeviceLink({
              sourceDeviceId: pe.id,
              targetDeviceId: ce.id,
              linkType: 'auto-discovered',
              linkLabel: `${pe.name} → ${ce.name}`,
              bandwidthMbps: 10000 // 10G uplink
            });
            newLinks.push(link);
          }
        }
      }
      
      // ISP-CE → Firewall
      const ceOrPE = ispCE.length > 0 ? ispCE : ispPE;
      for (const ce of ceOrPE) {
        for (const fw of firewalls) {
          if (!linkExists(ce.id, fw.id)) {
            const link = await this.createDeviceLink({
              sourceDeviceId: ce.id,
              targetDeviceId: fw.id,
              linkType: 'auto-discovered',
              linkLabel: `${ce.name} → ${fw.name}`,
              bandwidthMbps: 10000
            });
            newLinks.push(link);
          }
        }
      }
      
      // Firewall → Router
      const fwOrCE = firewalls.length > 0 ? firewalls : ceOrPE;
      for (const fw of fwOrCE) {
        for (const rtr of routers) {
          if (!linkExists(fw.id, rtr.id)) {
            const link = await this.createDeviceLink({
              sourceDeviceId: fw.id,
              targetDeviceId: rtr.id,
              linkType: 'auto-discovered',
              linkLabel: `${fw.name} → ${rtr.name}`,
              bandwidthMbps: 10000
            });
            newLinks.push(link);
          }
        }
      }
      
      // Router → Distribution Switch
      const rtrOrFW = routers.length > 0 ? routers : fwOrCE;
      for (const rtr of rtrOrFW) {
        for (const dst of distribution) {
          if (!linkExists(rtr.id, dst.id)) {
            const link = await this.createDeviceLink({
              sourceDeviceId: rtr.id,
              targetDeviceId: dst.id,
              linkType: 'auto-discovered',
              linkLabel: `${rtr.name} → ${dst.name}`,
              bandwidthMbps: 10000
            });
            newLinks.push(link);
          }
        }
      }
      
      // Distribution → Access Switches
      const dstOrRtr = distribution.length > 0 ? distribution : rtrOrFW;
      for (const dst of dstOrRtr) {
        for (const acc of accessSwitches) {
          if (!linkExists(dst.id, acc.id)) {
            const link = await this.createDeviceLink({
              sourceDeviceId: dst.id,
              targetDeviceId: acc.id,
              linkType: 'auto-discovered',
              linkLabel: `${dst.name} → ${acc.name}`,
              bandwidthMbps: 1000
            });
            newLinks.push(link);
          }
        }
      }
      
      // Access Switches → Access Points (or Distribution → APs if no access switches)
      const accOrDst = accessSwitches.length > 0 ? accessSwitches : dstOrRtr;
      for (const acc of accOrDst) {
        for (const ap of accessPoints) {
          if (!linkExists(acc.id, ap.id)) {
            const link = await this.createDeviceLink({
              sourceDeviceId: acc.id,
              targetDeviceId: ap.id,
              linkType: 'auto-discovered',
              linkLabel: `${acc.name} → ${ap.name}`,
              bandwidthMbps: 1000
            });
            newLinks.push(link);
          }
        }
      }
      
      // Fallback: Legacy type-based linking for devices not matching naming patterns
      const unmatched = siteDevices.filter(d => 
        !ispPE.includes(d) && !ispCE.includes(d) && !firewalls.includes(d) &&
        !routers.includes(d) && !distribution.includes(d) && 
        !accessSwitches.includes(d) && !accessPoints.includes(d)
      );
      
      const legacyRouters = unmatched.filter(d => d.type === 'mikrotik' || d.type === 'router' || d.type === 'cisco');
      const legacySwitches = unmatched.filter(d => d.type === 'switch' || d.type === 'dlink');
      const legacyAPs = unmatched.filter(d => d.type === 'unifi' || d.type === 'ap');
      
      // Connect legacy routers to switches
      for (const router of legacyRouters) {
        for (const sw of legacySwitches) {
          if (!linkExists(router.id, sw.id)) {
            const link = await this.createDeviceLink({
              sourceDeviceId: router.id,
              targetDeviceId: sw.id,
              linkType: 'auto-discovered',
              linkLabel: `${router.name} <-> ${sw.name}`,
              bandwidthMbps: 1000
            });
            newLinks.push(link);
          }
        }
      }
      
      // Connect legacy switches to APs
      for (const sw of legacySwitches) {
        for (const ap of legacyAPs) {
          if (!linkExists(sw.id, ap.id)) {
            const link = await this.createDeviceLink({
              sourceDeviceId: sw.id,
              targetDeviceId: ap.id,
              linkType: 'auto-discovered',
              linkLabel: `${sw.name} <-> ${ap.name}`,
              bandwidthMbps: 1000
            });
            newLinks.push(link);
          }
        }
      }
    }
    
    return newLinks;
  }
}

export const storage = new DatabaseStorage();
