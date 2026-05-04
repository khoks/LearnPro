// STORY-056 — daily-job entrypoint that runs all retention sweepers.
// Run with `pnpm --filter @learnpro/db db:retention`. Self-hosted operators wire to system cron;
// SaaS will hand it off to a worker queue.
import { createDb, loadDatabaseUrl } from "./client.js";
import { sweepAll } from "./retention.js";

async function main(): Promise<void> {
  const url = loadDatabaseUrl(process.env);
  const { db, pool } = createDb({ connectionString: url });
  try {
    const now = new Date();
    const result = await sweepAll(db, now);
    console.log(`[db:retention] sweepAll @ ${now.toISOString()}:`, JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("retention-sweep.ts") || argv1.endsWith("retention-sweep.js")) {
  main().catch((err: unknown) => {
    console.error("[db:retention] failed:", err);
    process.exit(1);
  });
}
