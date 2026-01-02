import { pgTable, text, serial, integer, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  community: text("community").default("public").notNull(),
  type: text("type").notNull(), // 'unifi', 'mikrotik', 'fortigate', 'dlink', 'cisco', 'iot', 'sunnyboy', 'victron', 'ipphone', 'generic'
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

export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Log = typeof logs.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;
export type MetricsHistory = typeof metricsHistory.$inferSelect;
export type InsertMetricsHistory = z.infer<typeof insertMetricsHistorySchema>;

// Export auth models
export * from "./models/auth";
