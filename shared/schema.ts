import { pgTable, text, serial, integer, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Poll type determines how device is monitored
export type PollType = 'ping_only' | 'snmp_only' | 'ping_and_snmp' | 'ping_or_snmp';

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  community: text("community").default("public").notNull(),
  type: text("type").notNull(), // 'unifi', 'mikrotik', 'fortigate', 'dlink', 'cisco', 'iot', 'sunnyboy', 'victron', 'ipphone', 'generic'
  pollType: text("poll_type").default("snmp_only").notNull(), // 'ping_only', 'snmp_only', 'ping_and_snmp', 'ping_or_snmp'
  status: text("status").default("unknown").notNull(), // 'green', 'red', 'blue'
  utilization: integer("utilization").default(0).notNull(), // 0-100 percentage
  bandwidthMBps: text("bandwidth_mbps").default("0").notNull(), // Actual value as string for precision
  downloadMbps: text("download_mbps").default("0").notNull(), // Download speed in Mbps
  uploadMbps: text("upload_mbps").default("0").notNull(), // Upload speed in Mbps
  lastInCounter: bigint("last_in_counter", { mode: "bigint" }).default(sql`0`).notNull(),
  lastOutCounter: bigint("last_out_counter", { mode: "bigint" }).default(sql`0`).notNull(),
  lastCheck: timestamp("last_check"),
  lastSeen: timestamp("last_seen"),
  site: text("site").notNull(), // The 12 site names
  totalChecks: integer("total_checks").default(0).notNull(), // Total SNMP poll attempts
  successfulChecks: integer("successful_checks").default(0).notNull(), // Successful poll responses
  interfaceIndex: integer("interface_index").default(1).notNull(), // SNMP interface index to monitor
  interfaceName: text("interface_name"), // Human-readable interface name
  activeUsers: integer("active_users").default(0).notNull(), // Active hotspot/usermanager users (Mikrotik only)
  maxBandwidth: integer("max_bandwidth").default(100).notNull(), // Maximum bandwidth in Mbps for utilization calculation
});

export const insertDeviceSchema = createInsertSchema(devices).omit({
  id: true,
  status: true,
  utilization: true,
  bandwidthMBps: true,
  downloadMbps: true,
  uploadMbps: true,
  lastInCounter: true,
  lastOutCounter: true,
  lastCheck: true,
  lastSeen: true,
  totalChecks: true,
  successfulChecks: true,
  activeUsers: true,
});

export const logs = pgTable("logs", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").references(() => devices.id),
  site: text("site").notNull(),
  type: text("type").notNull(), // 'status_change', 'bandwidth_alert', 'system'
  message: text("message").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertLogSchema = createInsertSchema(logs).omit({ id: true, timestamp: true });

export const metricsHistory = pgTable("metrics_history", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").references(() => devices.id).notNull(),
  site: text("site").notNull(),
  utilization: integer("utilization").default(0).notNull(),
  bandwidthMBps: text("bandwidth_mbps").default("0").notNull(),
  downloadMbps: text("download_mbps").default("0").notNull(),
  uploadMbps: text("upload_mbps").default("0").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertMetricsHistorySchema = createInsertSchema(metricsHistory).omit({ id: true, timestamp: true });

// Device interfaces table for multi-interface monitoring
export const deviceInterfaces = pgTable("device_interfaces", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").references(() => devices.id).notNull(),
  interfaceIndex: integer("interface_index").notNull(),
  interfaceName: text("interface_name"),
  isPrimary: integer("is_primary").default(0).notNull(), // 1 = primary, 0 = secondary
  status: text("status").default("unknown").notNull(),
  utilization: integer("utilization").default(0).notNull(),
  downloadMbps: text("download_mbps").default("0").notNull(),
  uploadMbps: text("upload_mbps").default("0").notNull(),
  lastInCounter: bigint("last_in_counter", { mode: "bigint" }).default(sql`0`).notNull(),
  lastOutCounter: bigint("last_out_counter", { mode: "bigint" }).default(sql`0`).notNull(),
  lastCheck: timestamp("last_check"),
});

export const insertDeviceInterfaceSchema = createInsertSchema(deviceInterfaces).omit({
  id: true,
  status: true,
  utilization: true,
  downloadMbps: true,
  uploadMbps: true,
  lastInCounter: true,
  lastOutCounter: true,
  lastCheck: true,
});

// Interface metrics history for graphing
export const interfaceMetricsHistory = pgTable("interface_metrics_history", {
  id: serial("id").primaryKey(),
  interfaceId: integer("interface_id").references(() => deviceInterfaces.id).notNull(),
  deviceId: integer("device_id").references(() => devices.id).notNull(),
  site: text("site").notNull(),
  interfaceName: text("interface_name"),
  utilization: integer("utilization").default(0).notNull(),
  downloadMbps: text("download_mbps").default("0").notNull(),
  uploadMbps: text("upload_mbps").default("0").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertInterfaceMetricsHistorySchema = createInsertSchema(interfaceMetricsHistory).omit({ id: true, timestamp: true });

// Application settings table (single row for global config)
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  pollingIntervalMs: integer("polling_interval_ms").default(5000).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({
  id: true,
  updatedAt: true,
});

// Notification settings table
export const notificationSettings = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  // Email settings
  emailEnabled: integer("email_enabled").default(0).notNull(), // 0 = disabled, 1 = enabled
  emailRecipients: text("email_recipients"), // Comma-separated email addresses
  // Telegram settings
  telegramEnabled: integer("telegram_enabled").default(0).notNull(),
  telegramBotToken: text("telegram_bot_token"),
  telegramChatId: text("telegram_chat_id"),
  // Notification preferences
  notifyOnOffline: integer("notify_on_offline").default(1).notNull(),
  notifyOnRecovery: integer("notify_on_recovery").default(1).notNull(),
  notifyOnHighUtilization: integer("notify_on_high_utilization").default(0).notNull(),
  utilizationThreshold: integer("utilization_threshold").default(90).notNull(),
  // Cooldown to prevent spam (minutes)
  cooldownMinutes: integer("cooldown_minutes").default(5).notNull(),
  lastNotificationAt: timestamp("last_notification_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNotificationSettingsSchema = createInsertSchema(notificationSettings).omit({
  id: true,
  lastNotificationAt: true,
  updatedAt: true,
});

// Monthly availability snapshots (reset at month end, stored for historical reporting)
export const availabilityMonthly = pgTable("availability_monthly", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").references(() => devices.id).notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  totalChecks: integer("total_checks").default(0).notNull(),
  successfulChecks: integer("successful_checks").default(0).notNull(),
  uptimePercentage: text("uptime_percentage").default("0.00").notNull(), // Stored as string for precision
  snapshotTakenAt: timestamp("snapshot_taken_at").defaultNow().notNull(),
});

export const insertAvailabilityMonthlySchema = createInsertSchema(availabilityMonthly).omit({
  id: true,
  snapshotTakenAt: true,
});

// Annual availability aggregation (compiled from monthly snapshots)
export const availabilityAnnual = pgTable("availability_annual", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").references(() => devices.id).notNull(),
  year: integer("year").notNull(),
  totalChecks: integer("total_checks").default(0).notNull(),
  successfulChecks: integer("successful_checks").default(0).notNull(),
  uptimePercentage: text("uptime_percentage").default("0.00").notNull(),
  monthsRecorded: integer("months_recorded").default(0).notNull(), // How many months have been compiled
  compiledAt: timestamp("compiled_at").defaultNow().notNull(),
});

export const insertAvailabilityAnnualSchema = createInsertSchema(availabilityAnnual).omit({
  id: true,
  compiledAt: true,
});

export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Log = typeof logs.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;
export type MetricsHistory = typeof metricsHistory.$inferSelect;
export type InsertMetricsHistory = z.infer<typeof insertMetricsHistorySchema>;
export type DeviceInterface = typeof deviceInterfaces.$inferSelect;
export type InsertDeviceInterface = z.infer<typeof insertDeviceInterfaceSchema>;
export type InterfaceMetricsHistory = typeof interfaceMetricsHistory.$inferSelect;
export type InsertInterfaceMetricsHistory = z.infer<typeof insertInterfaceMetricsHistorySchema>;
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;
export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AvailabilityMonthly = typeof availabilityMonthly.$inferSelect;
export type InsertAvailabilityMonthly = z.infer<typeof insertAvailabilityMonthlySchema>;
export type AvailabilityAnnual = typeof availabilityAnnual.$inferSelect;
export type InsertAvailabilityAnnual = z.infer<typeof insertAvailabilityAnnualSchema>;

// Sites table for persistent site configuration
export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSiteSchema = createInsertSchema(sites).omit({
  id: true,
  createdAt: true,
});

export type Site = typeof sites.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;

// Export auth models
export * from "./models/auth";
