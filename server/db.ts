import { drizzle } from "drizzle-orm/bun-sqlite";
import { connect } from "../lib/sqlite-proxy";
import * as schema from "../shared/schema";

export const db = drizzle(connect({ max: 1 }), { schema });