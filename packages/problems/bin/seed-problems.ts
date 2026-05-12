// STORY-068 — seed the curated problem YAMLs into Postgres so fresh self-hosters have content
// for the tutor's assign-problem tool to pick from. Idempotent: re-running upserts.
//
// Prereq: `pnpm --filter @learnpro/tracks db:seed:tracks` must run first (problems FK into
// tracks via track.slug → tracks.id lookup; seedProblems throws if a referenced track is
// missing). The aggregated `db:bootstrap` script (root package.json) chains both in order.

import { createDb, loadDatabaseUrl } from "@learnpro/db";
import { loadProblems, seedProblems } from "../src/index.js";

async function main(): Promise<void> {
  const url = loadDatabaseUrl(process.env);
  const { db, pool } = createDb({ connectionString: url });
  try {
    const defs = loadProblems();
    const result = await seedProblems(db, defs);
    console.log("[db:seed:problems] complete:", { ...result, total_loaded: defs.length });
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[db:seed:problems] failed:", err);
  process.exit(1);
});
