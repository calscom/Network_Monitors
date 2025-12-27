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
  utilization: integer("utilization").default(0).notNull(), // percent 0-100
  bandwidthMBps: text("bandwidth_mbps").default("0").notNull(), // actual value in MBps
  prevCounter: bigint("prev_counter", { mode: "number" }).default(0).notNull(),
  lastCheck: timestamp("last_check"),
  lastSeen: timestamp("last_seen"),
});

export const insertDeviceSchema = createInsertSchema(devices).omit({
  id: true,
  status: true,
  utilization: true,
  bandwidthMBps: true,
  prevCounter: true,
  lastSeen: true,
  lastCheck: true
});

export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
