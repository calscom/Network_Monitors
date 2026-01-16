import { z } from "zod";
import { createSelectSchema } from "drizzle-zod";
import { devices, interfaces, links, sites, users } from "../shared/schema";

export const cache = {
  devices: new Map<string, z.infer<typeof selectDeviceSchema>>(),
  interfaces: new Map<string, z.infer<typeof selectInterfaceSchema>>(),
  links: new Map<string, z.infer<typeof selectLinkSchema>>(),
  sites: new Map<string, z.infer<typeof selectSiteSchema>>(),
  users: new Map<string, z.infer<typeof selectUserSchema>>(),
};

export const selectDeviceSchema = createSelectSchema(devices);
export const selectInterfaceSchema = createSelectSchema(interfaces);
export const selectLinkSchema = createSelectSchema(links);
export const selectSiteSchema = createSelectSchema(sites);
export const selectUserSchema = createSelectSchema(users);
