// STORY-023 — daily-job entrypoint that prunes notifications older than the retention window.
// Run with `pnpm --filter @learnpro/db db:gc`. Self-hosted operators wire this to system cron;
// SaaS will hand it off to a worker queue.
import { createDb, loadDatabaseUrl } from "./client.js";
import { gcOldNotifications } from "./notifications.js";

const RETENTION_DAYS = Number(process.env["LEARNPRO_NOTIFICATIONS_RETENTION_DAYS"] ?? 30);

async function main(): Promise<void> {
  const url = loadDatabaseUrl(process.env);
  const { db, pool } = createDb({ connectionString: url });
  try {
    const deleted = await gcOldNotifications(db, RETENTION_DAYS);
    console.log(`[db:gc-notifications] deleted ${deleted} rows older than ${RETENTION_DAYS}d`);
  } finally {
    await pool.end();
  }
}

const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("notifications-gc.ts") || argv1.endsWith("notifications-gc.js")) {
  main().catch((err: unknown) => {
    console.error("[db:gc-notifications] failed:", err);
    process.exit(1);
  });
}
