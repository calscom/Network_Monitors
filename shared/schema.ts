import { pgTable, text, serial, integer, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  community: text("community").default("public").notNull(),
  type: text("type").notNull(), // 'unifi', 'mikrotik', 'generic'
  status: text("status").default("unknown").notNull(), // 'green', 'red', 'blue'
  utilization: integer("utilization").default(0).notNull(), // 0-100 percentage
  bandwidthMBps: text("bandwidth_mbps").default("0").notNull(), // Actual value as string for precision
  lastCounter: bigint("last_counter", { mode: "bigint" }).default(BigInt(0)).notNull(),
  lastCheck: timestamp("last_check"),
  lastSeen: timestamp("last_seen"),
  site: text("site").notNull(), // The 12 site names
});

export const insertDeviceSchema = createInsertSchema(devices).omit({
  id: true,
  status: true,
  utilization: true,
  bandwidthMBps: true,
  lastCounter: true,
  lastCheck: true,
  lastSeen: true
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
export type Log = typeof logs.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;
