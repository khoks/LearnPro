import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  createDb,
  organizations,
  problems,
  runMigrations,
  SELF_HOSTED_ORG_ID,
  tracks,
  type LearnProDb,
} from "@learnpro/db";
import { loadProblems } from "./loader.js";
import { seedProblems } from "./loader.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Integration test against a real Postgres (Docker Compose, see infra/docker/docker-compose.dev.yaml).
// Skipped when DATABASE_URL isn't set so `pnpm test` still passes in CI without a DB.
// Run locally with: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/problems test`
describe.skipIf(!DATABASE_URL)("seedProblems (integration)", () => {
  let db: LearnProDb;
  let pool: ReturnType<typeof createDb>["pool"];
  const trackSlugs = new Set<string>();

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();

    await db
      .insert(organizations)
      .values({ id: SELF_HOSTED_ORG_ID, name: "Self-hosted" })
      .onConflictDoNothing();

    // Bank uses two distinct tracks.
    for (const slug of ["python-fundamentals", "typescript-fundamentals"]) {
      trackSlugs.add(slug);
      await db
        .insert(tracks)
        .values({
          slug,
          name: slug,
          language: slug.startsWith("python") ? "python" : "typescript",
          description: `seed-test track ${slug}`,
        })
        .onConflictDoNothing();
    }
  });

  afterAll(async () => {
    if (db) {
      const trackIds = await db
        .select({ id: tracks.id })
        .from(tracks)
        .where(
          and(eq(tracks.org_id, SELF_HOSTED_ORG_ID), inArray(tracks.slug, Array.from(trackSlugs))),
        );
      const ids = trackIds.map((r) => r.id);
      if (ids.length > 0) {
        await db.delete(problems).where(inArray(problems.track_id, ids));
        await db.delete(tracks).where(inArray(tracks.id, ids));
      }
    }
    await pool?.end();
  });

  it("inserts every problem on first call and is idempotent on the second", async () => {
    const defs = loadProblems();
    expect(defs.length).toBeGreaterThan(0);

    const first = await seedProblems(db, defs);
    expect(first.inserted + first.updated).toBe(defs.length);

    const countAfterFirst = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(problems)
      .where(eq(problems.org_id, SELF_HOSTED_ORG_ID));
    const c1 = countAfterFirst[0]?.c ?? 0;
    expect(c1).toBe(defs.length);

    const second = await seedProblems(db, defs);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(defs.length);

    const countAfterSecond = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(problems)
      .where(eq(problems.org_id, SELF_HOSTED_ORG_ID));
    const c2 = countAfterSecond[0]?.c ?? 0;
    expect(c2).toBe(c1);
  });
});
