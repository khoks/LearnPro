import { createDb, type LearnProDb } from "@learnpro/db";
import type { Pool } from "pg";

// Single Postgres pool for the web server's Auth.js adapter + signIn-event profile bootstrap.
// Lazily initialized so build-time / static-page renders don't open connections.
let cached: { db: LearnProDb; pool: Pool } | null = null;

export function getAuthDb(): { db: LearnProDb; pool: Pool } {
  if (cached) return cached;
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error("DATABASE_URL is not set — required for Auth.js sessions and profile bootstrap");
  }
  cached = createDb({ connectionString: url });
  return cached;
}
