// STORY-061 — operator entrypoint for `importDump()`. Reads a JSON dump on stdin and writes
// the rows back into the DB pointed at by `DATABASE_URL`.
//
//   pnpm --filter @learnpro/db db:import < dump.json
//
// stdout receives a single JSON line summarizing the result; stderr receives any warnings
// (collisions, "user already exists", etc.) emitted by the helper.
import { createDb, loadDatabaseUrl } from "../src/client.js";
import { importDump } from "../src/data-import.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const url = loadDatabaseUrl(process.env);
  const raw = await readStdin();
  if (raw.trim() === "") {
    throw new Error("[db:import] expected a JSON dump on stdin — got empty input");
  }
  let dump: unknown;
  try {
    dump = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[db:import] failed to parse stdin as JSON: ${(err as Error).message}`);
  }

  const { db, pool } = createDb({ connectionString: url });
  try {
    const result = await importDump(db, dump, {
      logger: (line) => {
        process.stderr.write(`${line}\n`);
      },
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("import.ts") || argv1.endsWith("import.js")) {
  main().catch((err: unknown) => {
    console.error("[db:import] failed:", err);
    process.exit(1);
  });
}
