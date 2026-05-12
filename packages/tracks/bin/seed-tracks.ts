// STORY-068 — seed the curated track YAMLs into Postgres so fresh self-hosters have something
// to learn against. Idempotent: re-running upserts. Mirrors `packages/db/bin/seed-concepts.ts`'s
// pattern.

import { createDb, loadDatabaseUrl } from "@learnpro/db";
import {
  loadTrack,
  seedTrack,
  PYTHON_FUNDAMENTALS_PATH,
  TYPESCRIPT_FUNDAMENTALS_PATH,
} from "../src/loader.js";

async function main(): Promise<void> {
  const url = loadDatabaseUrl(process.env);
  const { db, pool } = createDb({ connectionString: url });
  try {
    const python = await seedTrack(db, loadTrack(PYTHON_FUNDAMENTALS_PATH));
    const typescript = await seedTrack(db, loadTrack(TYPESCRIPT_FUNDAMENTALS_PATH));
    console.log("[db:seed:tracks] complete:", {
      python: { slug: python.slug, id: python.id },
      typescript: { slug: typescript.slug, id: typescript.id },
    });
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[db:seed:tracks] failed:", err);
  process.exit(1);
});
