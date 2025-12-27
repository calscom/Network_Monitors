import { pgTable, text, serial, integer, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").references(() => sites.id).notNull(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  community: text("community").default("public").notNull(),
  type: text("type").notNull(), // 'unifi', 'mikrotik', 'generic'
  status: text("status").default("unknown").notNull(), // 'green', 'red', 'blue'
  bandwidthMbps: doublePrecision("bandwidth_mbps").default(0).notNull(),
  utilizationPercent: integer("utilization_percent").default(0).notNull(),
  lastCounterValue: text("last_counter_value"), // Store as string to handle BigInt
  lastCounterTime: timestamp("last_counter_time"),
  lastSeen: timestamp("last_seen"),
  lastCheck: timestamp("last_check"),
});

export const insertSiteSchema = createInsertSchema(sites).omit({ id: true });
export const insertDeviceSchema = createInsertSchema(devices).omit({
  id: true,
  status: true,
  bandwidthMbps: true,
  utilizationPercent: true,
  lastCounterValue: true,
  lastCounterTime: true,
  lastSeen: true,
  lastCheck: true
});

export type Site = typeof sites.$inferSelect;
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
