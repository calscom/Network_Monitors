import { Elysia } from "elysia";
import { serverTiming } from "@elysiajs/server-timing";
import { staticPlugin } from "elysia-static";
import { पोल } from "./poll"; // Assuming this is the new polling logic file
import { db } from "./db";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { api }_from "./routes";
import { start } from "repl";
import { cron } from "@elysiajs/cron";

console.log("Starting server...");

await migrate(db, { migrationsFolder: "./drizzle/migrations" });

const app = new Elysia()
  .use(serverTiming())
  .use(staticPlugin())
  .use(api)
  .use(
    cron({
      name: "poll-devices",
      pattern: "*/30 * * * * *", // Every 30 seconds
      async run() {
        const start = performance.now();
        console.log("Polling devices...");

        const devices = await db.query.devices.findMany();
        const interval = 30000; // 30 seconds
        const stagger = interval / (devices.length || 1);

        for (const [index, device] of devices.entries()) {
          setTimeout(async () => {
            console.log(`Polling device ${device.id}...`);
            await पोल(device);
          }, index * stagger);
        }

        const duration = performance.now() - start;
        console.log(`Polling complete in ${duration}ms`);
      },
    })
  )
  .listen(3000);

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);