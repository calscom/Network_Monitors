import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Connection pool configuration for optimal performance
// - max: Maximum connections in pool (default would be 10, we use 20 for high-concurrency polling)
// - idle_timeout: Close idle connections after 30 seconds
// - connect_timeout: Fail fast if connection takes too long
const client = postgres(process.env.DATABASE_URL, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });