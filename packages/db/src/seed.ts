import { createDb, loadDatabaseUrl, type LearnProDb } from "./client.js";
import {
  SELF_HOSTED_ORG_ID,
  concepts,
  episodes,
  organizations,
  problems,
  profiles,
  skill_scores,
  tracks,
  users,
} from "./schema.js";

export const DEMO_ORG_ID = SELF_HOSTED_ORG_ID;
export const DEMO_USER_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_CONCEPT_ID = "22222222-2222-4222-8222-222222222222";
export const DEMO_TRACK_ID = "33333333-3333-4333-8333-333333333333";
export const DEMO_PROBLEM_ID = "44444444-4444-4444-8444-444444444444";
export const DEMO_EPISODE_ID = "55555555-5555-4555-8555-555555555555";

export interface SeedResult {
  user_id: string;
  episode_id: string;
}

export async function seedDemo(db: LearnProDb): Promise<SeedResult> {
  await db
    .insert(organizations)
    .values({ id: DEMO_ORG_ID, name: "Self-hosted" })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values({ id: DEMO_USER_ID, email: "demo@learnpro.local", org_id: DEMO_ORG_ID })
    .onConflictDoNothing();

  await db
    .insert(profiles)
    .values({
      user_id: DEMO_USER_ID,
      target_role: "swe_intern",
      time_budget_min: 30,
      primary_goal: "interview_prep",
      self_assessed_level: "beginner",
      language_comfort: { python: "comfortable", typescript: "learning" },
    })
    .onConflictDoNothing();

  await db
    .insert(concepts)
    .values({
      id: DEMO_CONCEPT_ID,
      slug: "two-pointer",
      name: "Two-pointer technique",
      language: "python",
    })
    .onConflictDoNothing();

  await db
    .insert(skill_scores)
    .values({
      user_id: DEMO_USER_ID,
      concept_id: DEMO_CONCEPT_ID,
      score: 35,
      confidence: 50,
    })
    .onConflictDoNothing();

  await db
    .insert(tracks)
    .values({
      id: DEMO_TRACK_ID,
      slug: "python-arrays-101",
      name: "Python arrays 101",
      language: "python",
      description: "Day-1 demo track for warm-up problems",
    })
    .onConflictDoNothing();

  await db
    .insert(problems)
    .values({
      id: DEMO_PROBLEM_ID,
      track_id: DEMO_TRACK_ID,
      slug: "two-sum",
      name: "Two Sum",
      language: "python",
      difficulty: "easy",
      statement:
        "Given an array of integers `nums` and an integer `target`, return indices of the two numbers that add up to `target`.",
      starter_code: "def two_sum(nums, target):\n    pass\n",
      hidden_tests: {
        cases: [
          { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
          { input: [[3, 2, 4], 6], expected: [1, 2] },
        ],
      },
    })
    .onConflictDoNothing();

  await db
    .insert(episodes)
    .values({
      id: DEMO_EPISODE_ID,
      user_id: DEMO_USER_ID,
      problem_id: DEMO_PROBLEM_ID,
      attempts: 1,
      hints_used: 0,
    })
    .onConflictDoNothing();

  return { user_id: DEMO_USER_ID, episode_id: DEMO_EPISODE_ID };
}

export async function runSeedFromEnv(): Promise<SeedResult> {
  const url = loadDatabaseUrl(process.env);
  const { db, pool } = createDb({ connectionString: url });
  try {
    return await seedDemo(db);
  } finally {
    await pool.end();
  }
}

const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("seed.ts") || argv1.endsWith("seed.js")) {
  runSeedFromEnv()
    .then((result) => {
      console.log("[db:seed] demo data inserted (idempotent):", result);
    })
    .catch((err: unknown) => {
      console.error("[db:seed] failed:", err);
      process.exit(1);
    });
}
