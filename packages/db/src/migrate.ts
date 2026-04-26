import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, loadDatabaseUrl } from "./client.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.join(HERE, "..", "migrations");

export async function runMigrations(): Promise<void> {
  const url = loadDatabaseUrl(process.env);
  const { db, pool } = createDb({ connectionString: url });
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("migrate.ts") || argv1.endsWith("migrate.js")) {
  runMigrations()
    .then(() => {
      console.log("[db:migrate] migrations applied");
    })
    .catch((err: unknown) => {
      console.error("[db:migrate] failed:", err);
      process.exit(1);
    });
}
