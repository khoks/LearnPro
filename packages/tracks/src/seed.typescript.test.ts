import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  concepts,
  createDb,
  organizations,
  runMigrations,
  SELF_HOSTED_ORG_ID,
  tracks,
  type LearnProDb,
} from "@learnpro/db";
import { loadTrack, seedTrack, TYPESCRIPT_FUNDAMENTALS_PATH } from "./loader.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Integration test against a real Postgres (Docker Compose, see infra/docker/docker-compose.dev.yaml).
// Skipped when DATABASE_URL isn't set so `pnpm test` still passes in CI without a DB.
// Run locally with: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/tracks test`
describe.skipIf(!DATABASE_URL)("seedTrack — typescript-fundamentals (integration)", () => {
  let db: LearnProDb;
  let pool: ReturnType<typeof createDb>["pool"];

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();

    await db
      .insert(organizations)
      .values({ id: SELF_HOSTED_ORG_ID, name: "Self-hosted" })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    if (db) {
      await db
        .delete(concepts)
        .where(and(eq(concepts.org_id, SELF_HOSTED_ORG_ID), eq(concepts.language, "typescript")));
      await db
        .delete(tracks)
        .where(
          and(eq(tracks.org_id, SELF_HOSTED_ORG_ID), eq(tracks.slug, "typescript-fundamentals")),
        );
    }
    await pool?.end();
  });

  it("writes the track row + every concept on first call and is idempotent on the second", async () => {
    const track = loadTrack(TYPESCRIPT_FUNDAMENTALS_PATH);
    expect(track.ordered_concepts.length).toBeGreaterThan(0);

    const first = await seedTrack(db, track);
    expect(first.concepts_inserted + first.concepts_updated).toBe(track.ordered_concepts.length);

    const trackRowsFirst = await db
      .select({ id: tracks.id })
      .from(tracks)
      .where(
        and(eq(tracks.org_id, SELF_HOSTED_ORG_ID), eq(tracks.slug, "typescript-fundamentals")),
      );
    expect(trackRowsFirst.length).toBe(1);

    const conceptCountFirst = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(concepts)
      .where(and(eq(concepts.org_id, SELF_HOSTED_ORG_ID), eq(concepts.language, "typescript")));
    const c1 = conceptCountFirst[0]?.c ?? 0;
    expect(c1).toBeGreaterThanOrEqual(track.ordered_concepts.length);

    const second = await seedTrack(db, track);
    expect(second.track_inserted).toBe(false);
    expect(second.concepts_inserted).toBe(0);
    expect(second.concepts_updated).toBe(track.ordered_concepts.length);

    const trackRowsSecond = await db
      .select({ id: tracks.id })
      .from(tracks)
      .where(
        and(eq(tracks.org_id, SELF_HOSTED_ORG_ID), eq(tracks.slug, "typescript-fundamentals")),
      );
    expect(trackRowsSecond.length).toBe(1);
    expect(trackRowsSecond[0]?.id).toBe(trackRowsFirst[0]?.id);

    const conceptCountSecond = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(concepts)
      .where(and(eq(concepts.org_id, SELF_HOSTED_ORG_ID), eq(concepts.language, "typescript")));
    const c2 = conceptCountSecond[0]?.c ?? 0;
    expect(c2).toBe(c1);
  });
});
