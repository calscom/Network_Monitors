import { z } from "zod";
import { createSelectSchema } from "drizzle-zod";
import { devices, deviceInterfaces, deviceLinks, sites } from "../shared/schema";
import { users } from "../shared/models/auth";

export const cache = {
  devices: new Map<string, z.infer<typeof selectDeviceSchema>>(),
  interfaces: new Map<string, z.infer<typeof selectInterfaceSchema>>(),
  links: new Map<string, z.infer<typeof selectLinkSchema>>(),
  sites: new Map<string, z.infer<typeof selectSiteSchema>>(),
  users: new Map<string, z.infer<typeof selectUserSchema>>(),
};

export const selectDeviceSchema = createSelectSchema(devices);
export const selectInterfaceSchema = createSelectSchema(deviceInterfaces);
export const selectLinkSchema = createSelectSchema(deviceLinks);
export const selectSiteSchema = createSelectSchema(sites);
export const selectUserSchema = createSelectSchema(users);
