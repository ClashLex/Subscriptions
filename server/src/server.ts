import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";
import { startBillingScheduler } from "./jobs/billing-scheduler.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] ${env.NODE_ENV} API listening on port ${env.PORT}`);
});

const stopBillingScheduler = startBillingScheduler();

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[server] ${signal} received — shutting down gracefully`);
  stopBillingScheduler();
  server.close();
  await pool.end().catch(() => undefined);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
