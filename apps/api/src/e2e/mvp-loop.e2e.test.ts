// STORY-063 — End-to-end test of the MVP single learning loop.
//
// Closes MVP definition-of-done criterion #5 (`docs/roadmap/MVP.md`):
//   "End-to-end test of the loop passes."
//
// Path B (chosen — see commit 1 of this Story): vitest + a fetch-driver against a real listening
// Fastify backed by a real Postgres. The MVP loop is API-driven (state machine + 4 tutor routes);
// the UI layer (apps/web/src/app/session, apps/web/src/lib/session-driver.ts, OnboardingClient.tsx)
// is thin glue around fetch(). Hitting the same routes the UI calls — with real DB writes — proves
// the loop end-to-end without paying for a Chromium download.
//
// Gating: the suite is `describe.skipIf(!LEARNPRO_E2E)` so default `pnpm test` doesn't try to
// boot Postgres. Operators run it via `pnpm e2e` (or `LEARNPRO_E2E=1 DATABASE_URL=... pnpm
// --filter @learnpro/api test e2e/mvp-loop`) — see README.
//
// Flow exercised (the 7 steps from MVP.md "the single loop"):
//   1. sign-in (simulated by `fixedUserSession`)
//   2. onboarding (deterministic 3-question fallback via LEARNPRO_DISABLE_ONBOARDING_LLM=1)
//   3. recommended  (GET /v1/recommendation reads target_role → full-stack-engineer)
//   4. session start (POST /v1/tutor/episodes assigns a problem)
//   5. submit-passing (POST /v1/tutor/episodes/:id/submit + AlwaysPassSandbox + scripted rubric)
//   6. finish        (POST /v1/tutor/episodes/:id/finish closes the episode + writes xp_awards)
//   7. next-problem  (POST /v1/tutor/episodes again — the loop is composable)
//
// DB delta assertions: ≥5 row deltas across episodes / submissions / agent_calls / interactions /
// xp_awards plus users.xp growth — see `assertDbDeltas()`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  agent_calls,
  bootstrapProfile,
  concepts,
  createDb,
  episodes,
  getUserXp,
  interactions,
  organizations,
  problems,
  profiles,
  runMigrations,
  submissions,
  tracks,
  users,
  xp_awards,
  type LearnProDb,
} from "@learnpro/db";
import { ROLE_LIBRARY } from "@learnpro/profile";
import {
  AlwaysPassSandbox,
  buildE2eServer,
  FakeLLMQueue,
  buildFakeLLM,
  waitForAgentCallRows,
} from "./harness.js";
import { DrizzleLLMTelemetrySink } from "@learnpro/db";

const E2E_ENABLED = process.env["LEARNPRO_E2E"] === "1";
const DATABASE_URL = process.env["DATABASE_URL"];
const ORG_ID = "self";

// The role library entry whose `recommended_track_slugs` we want our test track to satisfy.
// `full-stack-engineer` recommends `[typescript-fundamentals, python-fundamentals]` in that order;
// the e2e seed inserts the python track only (no TS) so the recommendation lookup returns one
// row — enough to assert the join against `tracks` is real.
const TEST_TARGET_ROLE = "full-stack-engineer";
const TEST_TRACK_SLUG = "python-fundamentals";

interface PoolLike {
  end(): Promise<void>;
}

describe.skipIf(!E2E_ENABLED || !DATABASE_URL)("MVP loop end-to-end (STORY-063)", () => {
  let db: LearnProDb;
  let pool: PoolLike;
  let app: Awaited<ReturnType<typeof buildE2eServer>>;
  let baseUrl: string;
  let testUserId: string;
  let testTrackId: string;
  let testProblemId: string;
  let llmQueue: FakeLLMQueue;
  let prevDisableOnboardingLLM: string | undefined;

  beforeAll(async () => {
    if (!DATABASE_URL) throw new Error("e2e: DATABASE_URL required");

    // Force the deterministic 3-question onboarding fallback so the suite never has to script the
    // LLM agent's free-text reply. The harness restores the prior value in afterAll.
    prevDisableOnboardingLLM = process.env["LEARNPRO_DISABLE_ONBOARDING_LLM"];
    process.env["LEARNPRO_DISABLE_ONBOARDING_LLM"] = "1";

    const created = createDb({ connectionString: DATABASE_URL });
    db = created.db;
    pool = created.pool;
    await runMigrations();
    await db
      .insert(organizations)
      .values({ id: ORG_ID, name: "Self-hosted" })
      .onConflictDoNothing();

    // Fresh user (avoid colliding with seed demo user). Each run uses a new email so onConflict
    // skips don't reuse a stale row's xp/streak counters.
    const stamp = Date.now();
    const u = await db
      .insert(users)
      .values({ email: `mvp-e2e-${stamp}@learnpro.local`, org_id: ORG_ID })
      .returning({ id: users.id });
    testUserId = u[0]!.id;
    await bootstrapProfile({ db, user_id: testUserId, org_id: ORG_ID });

    // Track + concepts + a single easy python problem. The python-fundamentals slug matches the
    // role library's recommended_track_slugs entry so GET /v1/recommendation returns it.
    const t = await db
      .insert(tracks)
      .values({
        slug: TEST_TRACK_SLUG,
        name: "Python fundamentals",
        language: "python",
        description: "MVP loop e2e track",
        org_id: ORG_ID,
      })
      .onConflictDoNothing()
      .returning({ id: tracks.id });
    if (t[0]) {
      testTrackId = t[0].id;
    } else {
      const lookup = await db
        .select({ id: tracks.id })
        .from(tracks)
        .where(eq(tracks.slug, TEST_TRACK_SLUG))
        .limit(1);
      testTrackId = lookup[0]!.id;
    }

    // Insert the concepts the test problem tags so updateProfile.resolveConceptIds finds them.
    await db
      .insert(concepts)
      .values([
        { slug: "strings", name: "Strings", language: "python", org_id: ORG_ID },
        { slug: "control-flow", name: "Control flow", language: "python", org_id: ORG_ID },
      ])
      .onConflictDoNothing();

    // Insert a problem with a slug that matches an actual seed-bank YAML — the tutor agent's
    // `loadProblemCatalog` joins YAML defs against `problems.slug`, so a row with a slug not in
    // the YAML catalog won't be a candidate. `count-vowels` is difficulty=1 (easy tier) per
    // packages/problems/python/count-vowels.yaml; cold-start picks easy → it's chosen.
    const p = await db
      .insert(problems)
      .values({
        track_id: testTrackId,
        slug: "count-vowels",
        name: "Count vowels",
        language: "python",
        difficulty: "1",
        statement:
          "Write `solve(s)` that returns the number of vowels in `s`. Vowels are a, e, i, o, u, case-insensitive.",
        starter_code: "def solve(s):\n    pass\n",
        hidden_tests: {
          cases: [
            { input: "", expected: 0 },
            { input: "hello", expected: 2 },
          ],
          public_examples: [{ input: "hello", expected: 2 }],
          reference_solution:
            "def solve(s):\n    vowels = set('aeiouAEIOU')\n    return sum(1 for c in s if c in vowels)\n",
          concept_tags: ["strings", "control-flow"],
          expected_median_time_to_solve_ms: 90_000,
        },
        org_id: ORG_ID,
      })
      .onConflictDoNothing()
      .returning({ id: problems.id });
    if (p[0]) {
      testProblemId = p[0].id;
    } else {
      const lookup = await db
        .select({ id: problems.id })
        .from(problems)
        .where(eq(problems.slug, "count-vowels"))
        .limit(1);
      testProblemId = lookup[0]!.id;
    }

    // The fake LLM: queue scripted texts the tutor agent will pull. The grade tool calls the LLM
    // *once per submit* for the rubric; updateProfile / assignProblem / giveHint do not.
    // We script:
    //   1) the rubric for the first submit (passing) — JSON shape parseable by safeParseRubricJson
    //   2) the rubric for any later submit (next-problem flow doesn't submit, but harmless)
    llmQueue = new FakeLLMQueue([
      JSON.stringify({
        rubric: { correctness: 1, idiomatic: 0.9, edge_case_coverage: 0.8 },
        prose_explanation: "Correct vowel-counting approach.",
      }),
    ]);
    const telemetry = new DrizzleLLMTelemetrySink({ db });
    const llm = buildFakeLLM({ queue: llmQueue, telemetry });
    const sandbox = new AlwaysPassSandbox();

    app = buildE2eServer({ db, user_id: testUserId, org_id: ORG_ID, llm, sandbox });
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    baseUrl = address; // Fastify returns the bound URL directly when port=0.
  });

  afterAll(async () => {
    // Tear down DB rows we own. Order matters because of FK chain.
    if (db && testUserId) {
      await db.delete(xp_awards).where(eq(xp_awards.user_id, testUserId));
      await db.delete(interactions).where(eq(interactions.user_id, testUserId));
      await db.delete(agent_calls).where(eq(agent_calls.user_id, testUserId));
      await db.delete(submissions).where(sql`true`);
      await db.delete(episodes).where(eq(episodes.user_id, testUserId));
      if (testProblemId) {
        await db.delete(problems).where(eq(problems.id, testProblemId));
      }
      await db.delete(profiles).where(eq(profiles.user_id, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    if (app) await app.close();
    if (pool) await pool.end();
    if (prevDisableOnboardingLLM === undefined) {
      delete process.env["LEARNPRO_DISABLE_ONBOARDING_LLM"];
    } else {
      process.env["LEARNPRO_DISABLE_ONBOARDING_LLM"] = prevDisableOnboardingLLM;
    }
  });

  it("exercises sign-in → onboarding → recommended → session → submit → finish → next-problem with ≥5 DB row deltas", async () => {
    // ---- Snapshot row counts BEFORE the loop runs. ----
    const before = await snapshotCounts(db, testUserId);
    const xpBefore = await getUserXp(db, testUserId);

    // ---- Step 1+2: onboarding (deterministic fallback) — 3 user replies → done. ----
    // The fallback's stateless logic uses `userTurn = userMessages.length` to pick the next
    // question + previous-reply capture:
    //   userTurn=1 (after 1st reply): captures target_role from that reply
    //   userTurn=2 (after 2nd reply): captures time_budget_min (numeric extraction)
    //   userTurn=3 (after 3rd reply): captures primary_goal + done=true
    //
    // The /onboarding UI seeds the conversation with an assistant greeting before any reply, so
    // the message history we POST is `[A_seed, U1, A1, U2, A2, U3]` after the third turn.
    const SEED_GREETING = {
      role: "assistant" as const,
      content: "Hi — I'm your coach. Let's get you set up.",
    };
    const onboardingTurns = [
      { user: TEST_TARGET_ROLE, expectDone: false }, // captures target_role
      { user: "45 minutes", expectDone: false }, // captures time_budget_min = 45
      { user: "land a backend gig", expectDone: true }, // captures primary_goal, done=true
    ];
    const messageHistory: Array<{ role: "user" | "assistant"; content: string }> = [SEED_GREETING];
    let lastDone = false;
    for (let i = 0; i < onboardingTurns.length; i += 1) {
      const turn = onboardingTurns[i]!;
      messageHistory.push({ role: "user", content: turn.user });
      const res = await fetch(`${baseUrl}/v1/onboarding/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: messageHistory }),
      });
      expect(res.status, `onboarding turn ${i} status`).toBe(200);
      const body = (await res.json()) as {
        assistant_message: string;
        captured: Record<string, unknown>;
        done: boolean;
      };
      expect(typeof body.assistant_message).toBe("string");
      messageHistory.push({ role: "assistant", content: body.assistant_message });
      expect(body.done).toBe(turn.expectDone);
      lastDone = body.done;
    }
    expect(lastDone).toBe(true);

    // Profile row should now have target_role set. Verify the profile-writer was wired and ran.
    const profileRow = await db
      .select({
        target_role: profiles.target_role,
        time_budget_min: profiles.time_budget_min,
        primary_goal: profiles.primary_goal,
      })
      .from(profiles)
      .where(eq(profiles.user_id, testUserId))
      .limit(1);
    expect(profileRow[0]?.target_role).toBe(TEST_TARGET_ROLE);
    expect(profileRow[0]?.time_budget_min).toBe(45);
    expect(profileRow[0]?.primary_goal).toBeTruthy();

    // ---- Step 3: recommended page reads target_role → role library → join `tracks`. ----
    const recRes = await fetch(`${baseUrl}/v1/recommendation`);
    expect(recRes.status).toBe(200);
    const rec = (await recRes.json()) as {
      role: { slug: string; label: string } | null;
      recommended_tracks: Array<{ slug: string; language: string }>;
      recommended_daily_minutes: number | null;
    };
    expect(rec.role?.slug).toBe(TEST_TARGET_ROLE);
    // The role library lists 2 track slugs; our seed only inserts python-fundamentals — the
    // helper drops missing slugs so we expect 1 row.
    expect(rec.recommended_tracks.length).toBeGreaterThanOrEqual(1);
    expect(rec.recommended_tracks.map((t) => t.slug)).toContain(TEST_TRACK_SLUG);
    // Sanity check: role library minutes match the response.
    const roleEntry = ROLE_LIBRARY.find((r) => r.slug === TEST_TARGET_ROLE);
    expect(rec.recommended_daily_minutes).toBe(roleEntry?.recommended_daily_minutes ?? null);

    // ---- Step 4: session start. POST /v1/tutor/episodes assigns the problem. ----
    const assignRes = await fetch(`${baseUrl}/v1/tutor/episodes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ track_id: testTrackId }),
    });
    expect(assignRes.status).toBe(201);
    const assigned = (await assignRes.json()) as {
      episode_id: string;
      problem_id: string;
      problem_slug: string;
      difficulty_tier: string;
      why_this_difficulty: string;
    };
    expect(assigned.episode_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(assigned.problem_id).toBe(testProblemId);
    expect(assigned.difficulty_tier).toBe("easy");
    expect(assigned.why_this_difficulty.toLowerCase()).toContain("cold-start");

    // ---- Telemetry: a small batch of interactions (cursor / edit / run) — STORY-055. ----
    // Payload shapes follow `InteractionEventSchema` in @learnpro/shared (cursor_focus needs
    // line_start/line_end/duration_ms; edit needs from/to/range; run needs language/exit_code).
    const interactionsRes = await fetch(`${baseUrl}/v1/interactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            type: "cursor_focus",
            payload: { line_start: 1, line_end: 2, duration_ms: 350 },
            episode_id: assigned.episode_id,
          },
          {
            type: "edit",
            payload: {
              from: "def solve(s):\n    pass\n",
              to: "def solve(s):\n    return 0\n",
              range: { start_line: 1, start_col: 0, end_line: 2, end_col: 0 },
            },
            episode_id: assigned.episode_id,
          },
          {
            type: "run",
            payload: { language: "python", exit_code: 0, duration_ms: 12 },
            episode_id: assigned.episode_id,
          },
        ],
      }),
    });
    expect(interactionsRes.status).toBe(202);

    // ---- Step 5: submit passing code. AlwaysPassSandbox makes hidden tests green; FakeLLMQueue
    //      hands the grader a JSON rubric with correctness=1 → final_outcome=passed. ----
    const submitRes = await fetch(`${baseUrl}/v1/tutor/episodes/${assigned.episode_id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "def solve(s):\n    return sum(1 for c in s if c in 'aeiouAEIOU')\n",
      }),
    });
    expect(submitRes.status).toBe(200);
    const grade = (await submitRes.json()) as {
      passed: boolean;
      submission_id: string;
      rubric: { correctness: number };
    };
    expect(grade.passed).toBe(true);
    expect(grade.submission_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(grade.rubric.correctness).toBe(1);

    // ---- Step 6: finish — closes the episode + writes xp_awards + updates skill score. ----
    // The HTTP factory rehydrates each session as `phase: "coding"` (the DB tracks attempts +
    // hints_used but not the in-memory `last_passed` from the prior submit), so a no-arg finish
    // would derive `final_outcome=failed`. The UI is supposed to pass an explicit outcome when
    // it has the grade response in hand — we follow that pattern here.
    const finishRes = await fetch(`${baseUrl}/v1/tutor/episodes/${assigned.episode_id}/finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome: "passed" }),
    });
    expect(finishRes.status).toBe(200);
    const finished = (await finishRes.json()) as {
      episode_id: string;
      final_outcome: string;
      xp_award: { amount: number; awarded: boolean };
      skill_updates: Array<{ concept_slug: string }>;
    };
    expect(finished.episode_id).toBe(assigned.episode_id);
    expect(finished.final_outcome).toBe("passed");
    expect(finished.xp_award.awarded).toBe(true);
    expect(finished.xp_award.amount).toBeGreaterThan(0);
    expect(finished.skill_updates.length).toBeGreaterThanOrEqual(1);

    // ---- Step 7: next-problem. The loop is composable: post /v1/tutor/episodes again. ----
    // Queue another rubric stub in case the second loop's grader gets called (defensively — this
    // step only assigns, doesn't submit; but the queue's default-stub fallback handles it too).
    const next = await fetch(`${baseUrl}/v1/tutor/episodes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ track_id: testTrackId }),
    });
    expect(next.status).toBe(201);
    const nextAssigned = (await next.json()) as { episode_id: string; problem_id: string };
    expect(nextAssigned.episode_id).not.toBe(assigned.episode_id);
    // With only 1 problem in the catalog, chooseOldest picks the same problem_id again — that's
    // fine: the loop's "next" semantics are about a fresh episode row, not a different problem.

    // ---- DB delta assertions: ≥5 row deltas. Wait for telemetry-sink writes to flush first. ----
    await waitForAgentCallRows({ db, user_id: testUserId, expected: 1, timeoutMs: 3000 });
    const after = await snapshotCounts(db, testUserId);
    const xpAfter = await getUserXp(db, testUserId);

    const deltas = {
      episodes: after.episodes - before.episodes,
      submissions: after.submissions - before.submissions,
      agent_calls: after.agent_calls - before.agent_calls,
      interactions: after.interactions - before.interactions,
      xp_awards: after.xp_awards - before.xp_awards,
      users_xp: xpAfter - xpBefore,
    };

    // Each individual delta must be positive — and `users.xp` must grow.
    expect(deltas.episodes, "episodes inserted").toBeGreaterThanOrEqual(2); // first + next
    expect(deltas.submissions, "submissions inserted").toBeGreaterThanOrEqual(1);
    expect(deltas.agent_calls, "agent_calls inserted").toBeGreaterThanOrEqual(1);
    expect(deltas.interactions, "interactions inserted").toBeGreaterThanOrEqual(3); // 3-event batch
    expect(deltas.xp_awards, "xp_awards inserted").toBeGreaterThanOrEqual(1);
    expect(deltas.users_xp, "users.xp grew").toBeGreaterThan(0);

    // Sanity: the count of *kinds* of growth is the AC's "≥5 row deltas" — count distinct
    // categories that grew. Six categories above; AC requires ≥5.
    const growingCategories = Object.values(deltas).filter((v) => v > 0).length;
    expect(growingCategories, "≥5 distinct DB delta categories grew").toBeGreaterThanOrEqual(5);
  });
});

async function snapshotCounts(
  db: LearnProDb,
  user_id: string,
): Promise<{
  episodes: number;
  submissions: number;
  agent_calls: number;
  interactions: number;
  xp_awards: number;
}> {
  const [epRows, subRows, acRows, ixRows, xaRows] = await Promise.all([
    db.select({ id: episodes.id }).from(episodes).where(eq(episodes.user_id, user_id)),
    // submissions are scoped by episode_id; the test owns the only episodes for this user, so a
    // global count of submissions whose episode joined to this user would be correct — easier to
    // count submissions tied to this user's episodes.
    db
      .select({ id: submissions.id })
      .from(submissions)
      .innerJoin(episodes, eq(submissions.episode_id, episodes.id))
      .where(eq(episodes.user_id, user_id)),
    db.select({ id: agent_calls.id }).from(agent_calls).where(eq(agent_calls.user_id, user_id)),
    db.select({ id: interactions.id }).from(interactions).where(eq(interactions.user_id, user_id)),
    db.select({ id: xp_awards.id }).from(xp_awards).where(eq(xp_awards.user_id, user_id)),
  ]);
  return {
    episodes: epRows.length,
    submissions: subRows.length,
    agent_calls: acRows.length,
    interactions: ixRows.length,
    xp_awards: xaRows.length,
  };
}
