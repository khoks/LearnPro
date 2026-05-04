import { eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type LearnProDb } from "./client.js";
import { exportUserData, type ExportFetcher } from "./data-export.js";
import { runMigrations } from "./migrate.js";
import {
  agent_calls,
  episodes,
  notifications,
  organizations,
  problems,
  profiles,
  submissions,
  tracks,
  users,
  type AgentCall,
  type Episode,
  type Notification,
  type Profile,
  type Submission,
  type User,
} from "./schema.js";

const DATABASE_URL = process.env["DATABASE_URL"];

// Captures all write() calls into an array, then joins them — lets us inspect both the
// chunked behavior (multiple writes happen) and the final assembled envelope.
function makeCollector(): { write: (chunk: string) => void; chunks: string[]; text: () => string } {
  const chunks: string[] = [];
  return {
    write: (c) => chunks.push(c),
    chunks,
    text: () => chunks.join(""),
  };
}

// In-memory fetcher — exercises the streaming/JSON-shape contract without touching Postgres.
function fakeFetcher(seed: {
  user?: User | null;
  profile?: Profile | null;
  episodes?: Episode[];
  submissions?: Submission[];
  agent_calls?: AgentCall[];
  notifications?: Notification[];
}): ExportFetcher {
  const eps = seed.episodes ?? [];
  const subs = seed.submissions ?? [];
  const agents = seed.agent_calls ?? [];
  const notifs = seed.notifications ?? [];
  return {
    user: async () => seed.user ?? null,
    profile: async () => seed.profile ?? null,
    episodesPage: async (_user_id, limit, offset) => eps.slice(offset, offset + limit),
    submissionsByEpisodes: async (ids) => subs.filter((s) => ids.includes(s.episode_id)),
    agentCallsPage: async (_user_id, limit, offset) => agents.slice(offset, offset + limit),
    notificationsPage: async (_user_id, limit, offset) => notifs.slice(offset, offset + limit),
  };
}

describe("exportUserData (no-DB shape contract)", () => {
  it("emits a parseable JSON envelope with all six top-level keys for an empty user", async () => {
    const sink = makeCollector();
    await exportUserData({
      user_id: "missing-user",
      write: sink.write,
      fetcher: fakeFetcher({}),
    });
    const json = JSON.parse(sink.text()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual([
      "agent_calls",
      "episodes",
      "notifications",
      "profile",
      "settings",
      "submissions",
    ]);
    expect(json["profile"]).toBeNull();
    expect(json["settings"]).toBeNull();
    expect(json["episodes"]).toEqual([]);
    expect(json["submissions"]).toEqual([]);
    expect(json["agent_calls"]).toEqual([]);
    expect(json["notifications"]).toEqual([]);
  });

  it("emits the envelope in multiple chunks (streaming, not buffer-then-flush)", async () => {
    const sink = makeCollector();
    await exportUserData({
      user_id: "u1",
      write: sink.write,
      fetcher: fakeFetcher({
        user: makeUser({ id: "u1" }),
        episodes: [makeEpisode({ id: "e1" }), makeEpisode({ id: "e2" })],
      }),
    });
    expect(sink.chunks.length).toBeGreaterThan(5); // open, key, value, comma, ... per section
    const json = JSON.parse(sink.text()) as { episodes: Array<{ id: string }> };
    expect(json.episodes.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("scopes submissions to the user's episode IDs (only)", async () => {
    const sink = makeCollector();
    await exportUserData({
      user_id: "u1",
      write: sink.write,
      fetcher: fakeFetcher({
        user: makeUser({ id: "u1" }),
        episodes: [makeEpisode({ id: "e1" })],
        submissions: [
          makeSubmission({ id: "s1", episode_id: "e1", code: "mine" }),
          makeSubmission({ id: "s2", episode_id: "e2", code: "theirs" }),
        ],
      }),
    });
    const json = JSON.parse(sink.text()) as { submissions: Array<{ id: string; code: string }> };
    expect(json.submissions).toHaveLength(1);
    expect(json.submissions[0]!.code).toBe("mine");
  });

  it("paginates: page_size=2 with 5 episodes still emits all 5", async () => {
    const eps = Array.from({ length: 5 }, (_, i) => makeEpisode({ id: `e${i + 1}` }));
    const sink = makeCollector();
    await exportUserData({
      user_id: "u1",
      write: sink.write,
      fetcher: fakeFetcher({ user: makeUser({ id: "u1" }), episodes: eps }),
      page_size: 2,
    });
    const json = JSON.parse(sink.text()) as { episodes: Array<{ id: string }> };
    expect(json.episodes.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
  });

  it("serializes timestamps as ISO strings (round-trip-importable contract)", async () => {
    const t = new Date("2026-04-26T12:34:56.000Z");
    const sink = makeCollector();
    await exportUserData({
      user_id: "u1",
      write: sink.write,
      fetcher: fakeFetcher({
        user: makeUser({ id: "u1", created_at: t }),
        profile: makeProfile({ user_id: "u1", updated_at: t }),
        episodes: [makeEpisode({ id: "e1", started_at: t, finished_at: t })],
      }),
    });
    const json = JSON.parse(sink.text()) as {
      profile: { created_at: string; profile: { updated_at: string } };
      settings: { updated_at: string };
      episodes: Array<{ started_at: string; finished_at: string | null }>;
    };
    expect(json.profile.created_at).toBe(t.toISOString());
    expect(json.profile.profile.updated_at).toBe(t.toISOString());
    expect(json.settings.updated_at).toBe(t.toISOString());
    expect(json.episodes[0]!.started_at).toBe(t.toISOString());
    expect(json.episodes[0]!.finished_at).toBe(t.toISOString());
  });

  it("requires either db or fetcher", async () => {
    const sink = makeCollector();
    await expect(exportUserData({ user_id: "u1", write: sink.write })).rejects.toThrow(
      /either `db` or `fetcher`/,
    );
  });
});

// Integration tests against a real Postgres (Docker Compose). Skipped when DATABASE_URL isn't
// set so `pnpm test` still passes in CI without a DB.
// Run locally with: `DATABASE_URL=postgresql://learnpro:learnpro@localhost:5432/learnpro pnpm --filter @learnpro/db test`
describe.skipIf(!DATABASE_URL)("exportUserData (integration)", () => {
  let db: LearnProDb;
  let pool: Pool;
  let testUserId: string;
  let testTrackId: string;
  let testProblemId: string;

  beforeAll(async () => {
    const created = createDb({ connectionString: DATABASE_URL ?? "" });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: "self", name: "Self-hosted" })
      .onConflictDoNothing();

    const insertedUser = await db
      .insert(users)
      .values({ email: `data-export-test-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    testUserId = insertedUser[0]!.id;

    const insertedTrack = await db
      .insert(tracks)
      .values({
        slug: `data-export-track-${Date.now()}`,
        name: "Data export test track",
        language: "python",
      })
      .returning({ id: tracks.id });
    testTrackId = insertedTrack[0]!.id;

    const insertedProblem = await db
      .insert(problems)
      .values({
        track_id: testTrackId,
        slug: `data-export-problem-${Date.now()}`,
        name: "Data export test problem",
        language: "python",
        difficulty: "easy",
        statement: "noop",
        hidden_tests: { cases: [] },
      })
      .returning({ id: problems.id });
    testProblemId = insertedProblem[0]!.id;
  });

  afterAll(async () => {
    if (db) {
      await cleanupUserData(db, testUserId);
      await db.delete(problems).where(eq(problems.id, testProblemId));
      await db.delete(tracks).where(eq(tracks.id, testTrackId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    await pool?.end();
  });

  beforeEach(async () => {
    await cleanupUserData(db, testUserId);
  });

  it("emits a valid JSON envelope with the expected counts for a fully-populated user", async () => {
    await db.insert(profiles).values({
      user_id: testUserId,
      target_role: "swe_intern",
      time_budget_min: 30,
      primary_goal: "land internship",
      self_assessed_level: "beginner",
      language_comfort: { python: "comfortable" },
    });

    const ep1 = await db
      .insert(episodes)
      .values({ user_id: testUserId, problem_id: testProblemId, attempts: 1, hints_used: 0 })
      .returning({ id: episodes.id });
    const ep2 = await db
      .insert(episodes)
      .values({ user_id: testUserId, problem_id: testProblemId, attempts: 3, hints_used: 2 })
      .returning({ id: episodes.id });

    await db.insert(submissions).values([
      { episode_id: ep1[0]!.id, code: "print(1)", passed: true, runtime_ms: 5 },
      { episode_id: ep1[0]!.id, code: "print(2)", passed: false, runtime_ms: 6 },
      { episode_id: ep2[0]!.id, code: "print(3)", passed: true, runtime_ms: 7 },
    ]);

    await db.insert(agent_calls).values([
      {
        user_id: testUserId,
        provider: "anthropic",
        model: "claude-haiku",
        input_tokens: 10,
        output_tokens: 5,
      },
      {
        user_id: testUserId,
        provider: "anthropic",
        model: "claude-haiku",
        input_tokens: 20,
        output_tokens: 8,
      },
    ]);

    await db
      .insert(notifications)
      .values([{ user_id: testUserId, channel: "in_app", title: "hi", body: "welcome" }]);

    const sink = makeCollector();
    await exportUserData({ db, user_id: testUserId, write: sink.write, page_size: 1 });
    const json = JSON.parse(sink.text()) as {
      profile: Record<string, unknown> | null;
      settings: Record<string, unknown> | null;
      episodes: unknown[];
      submissions: unknown[];
      agent_calls: unknown[];
      notifications: unknown[];
    };

    expect(json.profile).not.toBeNull();
    const profile = json.profile as Record<string, unknown>;
    expect(profile["user_id"]).toBe(testUserId);
    expect(profile["org_id"]).toBe("self");

    expect(json.settings).not.toBeNull();
    const settings = json.settings as Record<string, unknown>;
    expect(settings["target_role"]).toBe("swe_intern");
    expect(settings["time_budget_min"]).toBe(30);
    expect(settings["language_comfort"]).toEqual({ python: "comfortable" });

    expect(json.episodes).toHaveLength(2);
    expect(json.submissions).toHaveLength(3);
    expect(json.agent_calls).toHaveLength(2);
    expect(json.notifications).toHaveLength(1);
  });

  it("emits a valid envelope for a brand-new user (no profile row, no episodes)", async () => {
    const sink = makeCollector();
    await exportUserData({ db, user_id: testUserId, write: sink.write });
    const json = JSON.parse(sink.text()) as {
      profile: Record<string, unknown> | null;
      settings: Record<string, unknown> | null;
      episodes: unknown[];
      submissions: unknown[];
      agent_calls: unknown[];
      notifications: unknown[];
    };
    expect(json.profile).not.toBeNull();
    const profile = json.profile as Record<string, unknown>;
    expect(profile["user_id"]).toBe(testUserId);
    expect(profile["profile"]).toBeNull();
    expect(json.settings).toBeNull();
    expect(json.episodes).toEqual([]);
    expect(json.submissions).toEqual([]);
    expect(json.agent_calls).toEqual([]);
    expect(json.notifications).toEqual([]);
  });

  it("does not leak another user's submissions when episodes share a problem", async () => {
    const otherUser = await db
      .insert(users)
      .values({ email: `data-export-other-${Date.now()}@learnpro.local` })
      .returning({ id: users.id });
    const otherUserId = otherUser[0]!.id;
    try {
      const myEp = await db
        .insert(episodes)
        .values({ user_id: testUserId, problem_id: testProblemId })
        .returning({ id: episodes.id });
      const otherEp = await db
        .insert(episodes)
        .values({ user_id: otherUserId, problem_id: testProblemId })
        .returning({ id: episodes.id });
      await db.insert(submissions).values([
        { episode_id: myEp[0]!.id, code: "mine", passed: true },
        { episode_id: otherEp[0]!.id, code: "theirs", passed: false },
      ]);

      const sink = makeCollector();
      await exportUserData({ db, user_id: testUserId, write: sink.write });
      const json = JSON.parse(sink.text()) as { submissions: Array<{ code: string }> };
      expect(json.submissions).toHaveLength(1);
      expect(json.submissions[0]!.code).toBe("mine");
    } finally {
      await db.delete(episodes).where(eq(episodes.user_id, otherUserId));
      await db.delete(users).where(eq(users.id, otherUserId));
    }
  });

  it("paginates correctly when row count exceeds page_size", async () => {
    for (let i = 0; i < 5; i++) {
      await db.insert(episodes).values({ user_id: testUserId, problem_id: testProblemId });
    }
    const sink = makeCollector();
    await exportUserData({ db, user_id: testUserId, write: sink.write, page_size: 2 });
    const json = JSON.parse(sink.text()) as { episodes: unknown[] };
    expect(json.episodes).toHaveLength(5);
  });
});

async function cleanupUserData(db: LearnProDb, userId: string): Promise<void> {
  const userEpisodes = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.user_id, userId));
  const epIds = userEpisodes.map((e) => e.id);
  if (epIds.length > 0) {
    await db.delete(submissions).where(inArray(submissions.episode_id, epIds));
  }
  await db.delete(episodes).where(eq(episodes.user_id, userId));
  await db.delete(agent_calls).where(eq(agent_calls.user_id, userId));
  await db.delete(notifications).where(eq(notifications.user_id, userId));
  await db.delete(profiles).where(eq(profiles.user_id, userId));
}

// =============================================================================
// Stub-data factories for the no-DB shape-contract tests above.
// =============================================================================

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    org_id: "self",
    email: "u1@learnpro.local",
    name: null,
    emailVerified: null,
    image: null,
    github_id: null,
    xp: 0,
    streak_grace_days_remaining: 2,
    streak_grace_last_replenished_at: null,
    created_at: new Date(0),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    user_id: "u1",
    org_id: "self",
    target_role: null,
    time_budget_min: null,
    primary_goal: null,
    self_assessed_level: null,
    language_comfort: null,
    updated_at: new Date(0),
    ...overrides,
  };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: "e1",
    org_id: "self",
    user_id: "u1",
    problem_id: "p1",
    started_at: new Date(0),
    finished_at: null,
    hints_used: 0,
    attempts: 0,
    final_outcome: null,
    time_to_solve_ms: null,
    embedding: null,
    interactions_summary: null,
    ...overrides,
  };
}

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "s1",
    org_id: "self",
    episode_id: "e1",
    submitted_at: new Date(0),
    code: "noop",
    passed: false,
    runtime_ms: null,
    ...overrides,
  };
}
