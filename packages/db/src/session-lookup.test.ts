import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { findSessionUser } from "./session-lookup.js";
import { organizations, sessions, users } from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Integration test for the cross-app session lookup used by apps/api to authenticate Fastify
// requests via the cookie that apps/web's Auth.js sets. Skipped when DATABASE_URL is unset.
describe.skipIf(!DATABASE_URL)("findSessionUser (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: "self", name: "Self-hosted" })
      .onConflictDoNothing();
    const inserted = await db
      .insert(users)
      .values({ email: `session-lookup-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const id = inserted[0]?.id;
    if (!id) throw new Error("failed to insert test user");
    testUserId = id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(sessions).where(eq(sessions.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await db.delete(sessions).where(eq(sessions.userId, testUserId));
  });

  it("returns the user payload when the session token is valid and unexpired", async () => {
    const token = `tkn-${Date.now()}`;
    await db.insert(sessions).values({
      sessionToken: token,
      userId: testUserId,
      expires: new Date(Date.now() + 60_000),
    });
    const found = await findSessionUser({ db, session_token: token });
    expect(found).not.toBeNull();
    expect(found?.user_id).toBe(testUserId);
    expect(found?.org_id).toBe("self");
  });

  it("returns null for an unknown token", async () => {
    const found = await findSessionUser({ db, session_token: "does-not-exist" });
    expect(found).toBeNull();
  });

  it("returns null when the session is expired", async () => {
    const token = `expired-${Date.now()}`;
    await db.insert(sessions).values({
      sessionToken: token,
      userId: testUserId,
      expires: new Date(Date.now() - 60_000),
    });
    const found = await findSessionUser({ db, session_token: token });
    expect(found).toBeNull();
  });
});
