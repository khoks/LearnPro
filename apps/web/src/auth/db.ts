import { createDb, type LearnProDb } from "@learnpro/db";

// Single Postgres connection for the web server's Auth.js adapter + signIn-event profile bootstrap.
// Lazily initialized so build-time / static-page renders don't open connections. Returns just the
// drizzle handle — apps/web doesn't need the underlying pool, and keeping it out of the public
// shape lets us avoid a direct `pg` dep in this package.
let cached: LearnProDb | null = null;

export function getAuthDb(): LearnProDb {
  if (cached) return cached;
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — required for Auth.js sessions and profile bootstrap",
    );
  }
  const { db } = createDb({ connectionString: url });
  cached = db;
  return cached;
}
