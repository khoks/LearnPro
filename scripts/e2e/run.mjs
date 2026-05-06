#!/usr/bin/env node
// STORY-063 — pnpm e2e driver. Cross-platform Node script that:
//   1. Boots a Postgres container (separate from the dev compose stack so it can use its own
//      port + container name and not clash with `pnpm dev`).
//   2. Waits for Postgres to accept connections.
//   3. Runs `pnpm --filter @learnpro/db db:migrate` against it.
//   4. Runs the gated test under `LEARNPRO_E2E=1`.
//   5. By default leaves the container running for fast iteration. `pnpm e2e -- --teardown`
//      stops it on exit.
//
// Why a dedicated container: in dev environments where a host Postgres is already on 5432
// (Windows installs of PostgreSQL ship with the service running), the dev compose stack's
// port mapping silently fails open to the host's auth. Booting an e2e-specific container on
// 5433 dodges the conflict entirely and is the same shape CI will use.
//
// Override the connection string via `DATABASE_URL`; otherwise the script defaults to:
//   postgresql://learnpro:learnpro@localhost:5433/learnpro
//
// Flags:
//   --skip-up    Skip the docker boot (assume the container is already running).
//   --teardown   Stop + remove the container at the end of the run.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const E2E_CONTAINER = "learnpro-postgres-e2e";
const DEFAULT_PORT = process.env["LEARNPRO_E2E_DB_PORT"] || "5433";
const DEFAULT_DB_URL =
  process.env["DATABASE_URL"] ||
  `postgresql://learnpro:learnpro@localhost:${DEFAULT_PORT}/learnpro`;

const args = process.argv.slice(2);
const skipUp = args.includes("--skip-up");
const teardown = args.includes("--teardown");

function log(msg) {
  process.stdout.write(`[e2e] ${msg}\n`);
}

async function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cmdArgs, {
      stdio: opts.silent ? "ignore" : "inherit",
      shell: process.platform === "win32",
      cwd: opts.cwd ?? REPO_ROOT,
      env: { ...process.env, ...(opts.env ?? {}) },
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0 || opts.allowFailure) resolve(code ?? 0);
      else reject(new Error(`${cmd} ${cmdArgs.join(" ")} exited with code ${code}`));
    });
  });
}

async function dbReady(maxAttempts = 60, intervalMs = 1000) {
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      await run(
        "docker",
        ["exec", E2E_CONTAINER, "pg_isready", "-U", "learnpro", "-d", "learnpro"],
        { allowFailure: false, silent: true },
      );
      return;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  throw new Error(`Postgres not ready after ${maxAttempts} attempts`);
}

async function startContainer() {
  log(`Starting ${E2E_CONTAINER} on host port ${DEFAULT_PORT}...`);
  // Idempotent: if the container already exists, start it; if not, create it.
  await run(
    "docker",
    [
      "run",
      "-d",
      "--name",
      E2E_CONTAINER,
      "-p",
      `${DEFAULT_PORT}:5432`,
      "-e",
      "POSTGRES_USER=learnpro",
      "-e",
      "POSTGRES_PASSWORD=learnpro",
      "-e",
      "POSTGRES_DB=learnpro",
      "pgvector/pgvector:pg16",
    ],
    { allowFailure: true }, // already-exists returns non-zero; --start handles it below
  );
  // Make sure it's up (handles both first-time create and existing stopped container).
  await run("docker", ["start", E2E_CONTAINER], { allowFailure: true, silent: true });
}

async function main() {
  if (!skipUp) {
    await startContainer();
    log("Waiting for Postgres to accept connections...");
    await dbReady();
  } else {
    log("--skip-up: assuming Postgres is already up");
  }

  log("Applying migrations...");
  await run("pnpm", ["--filter", "@learnpro/db", "db:migrate"], {
    env: { DATABASE_URL: DEFAULT_DB_URL },
  });

  log("Running e2e test (LEARNPRO_E2E=1)...");
  await run("pnpm", ["--filter", "@learnpro/api", "test", "--", "src/e2e/mvp-loop.e2e.test.ts"], {
    env: { LEARNPRO_E2E: "1", DATABASE_URL: DEFAULT_DB_URL },
  });
  log("e2e suite passed.");

  if (teardown) {
    log(`--teardown: stopping + removing ${E2E_CONTAINER}...`);
    await run("docker", ["rm", "-f", E2E_CONTAINER], { allowFailure: true, silent: true });
  } else {
    log(
      `Leaving ${E2E_CONTAINER} running on port ${DEFAULT_PORT}. Use \`pnpm e2e -- --teardown\` to stop it.`,
    );
  }
}

main().catch((err) => {
  process.stderr.write(`[e2e] FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
