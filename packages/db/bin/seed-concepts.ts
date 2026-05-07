import { createDb, loadDatabaseUrl } from "../src/client.js";
import { seedConceptsFromYaml } from "../src/concepts-seeder.js";

async function main(): Promise<void> {
  const url = loadDatabaseUrl(process.env);
  const { db, pool } = createDb({ connectionString: url });
  try {
    const result = await seedConceptsFromYaml(db);
    console.log("[db:seed:concepts] complete:", result);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[db:seed:concepts] failed:", err);
  process.exit(1);
});
