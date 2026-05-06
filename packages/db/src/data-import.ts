import { z } from "zod";
import type { LearnProDb } from "./client.js";

// STORY-061 — inverse of `exportUserData()` from STORY-026. Takes a parsed export envelope
// and writes the rows back into the supplied DB.
//
// Contract:
// - Accepts the JSON envelope `exportUserData()` produces (validated up-front with Zod).
// - Creates the user if absent, UPSERTs the profile, inserts episodes/submissions/agent_calls/
//   notifications preserving original UUIDs.
// - Idempotent — running the import twice on the same dump is a no-op (UUID collisions skipped
//   with a clear warning).
// - FK ordering: user → profile → episodes → submissions / agent_calls / notifications.
// - Problems are NOT in the export envelope. The import assumes the target instance has the
//   same problem catalog (sane for self-hosted migrations) and fails fast with a clear error
//   when a referenced `problem_id` is missing.
// - `embedding` on episodes is intentionally omitted on both export and import — the 1536-dim
//   vector is re-derivable from the next tutor call.

// =============================================================================
// Zod schemas — the runtime contract for the dump envelope.
// =============================================================================
//
// The schemas mirror `exportUserData()`'s output exactly. Anything `exportUserData()` writes
// must round-trip through here; anything not in the export shape is rejected.

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime())
  .describe("ISO-8601 timestamp");

const ProfileBlockSchema = z
  .object({
    user_id: z.string().uuid(),
    org_id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
    emailVerified: isoDate.nullable(),
    created_at: isoDate,
    xp: z.number().int(),
    streak_grace_days_remaining: z.number().int(),
    streak_grace_last_replenished_at: isoDate.nullable(),
    profile: z
      .object({
        target_role: z.string().nullable(),
        time_budget_min: z.number().int().nullable(),
        primary_goal: z.string().nullable(),
        self_assessed_level: z.string().nullable(),
        language_comfort: z.unknown().nullable(),
        updated_at: isoDate,
      })
      .nullable(),
  })
  .nullable();

const SettingsBlockSchema = z
  .object({
    target_role: z.string().nullable(),
    time_budget_min: z.number().int().nullable(),
    primary_goal: z.string().nullable(),
    self_assessed_level: z.string().nullable(),
    language_comfort: z.unknown().nullable(),
    updated_at: isoDate,
  })
  .nullable();

const EpisodeSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string(),
  user_id: z.string().uuid(),
  problem_id: z.string().uuid(),
  started_at: isoDate,
  finished_at: isoDate.nullable(),
  hints_used: z.number().int(),
  attempts: z.number().int(),
  final_outcome: z
    .enum(["passed", "passed_with_hints", "failed", "abandoned", "revealed"])
    .nullable(),
  time_to_solve_ms: z.number().int().nullable(),
  interactions_summary: z.unknown().nullable(),
});

const SubmissionSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string(),
  episode_id: z.string().uuid(),
  submitted_at: isoDate,
  code: z.string(),
  passed: z.boolean(),
  runtime_ms: z.number().int().nullable(),
});

const AgentCallSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string(),
  user_id: z.string().uuid().nullable(),
  session_id: z.string().nullable(),
  episode_id: z.string().uuid().nullable(),
  provider: z.string(),
  model: z.string(),
  role: z.enum(["tutor", "interviewer", "reflection", "grader", "router"]).nullable(),
  task: z.enum(["complete", "stream", "embed", "tool_call"]),
  prompt_version: z.string().nullable(),
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  cached_tokens: z.number().int().nullable(),
  cost_usd: z.string(),
  pricing_version: z.string(),
  tool_used: z.string().nullable(),
  latency_ms: z.number().int(),
  ok: z.boolean(),
  called_at: isoDate,
});

const NotificationSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string(),
  user_id: z.string().uuid(),
  channel: z.enum(["in_app", "web_push", "email", "whatsapp"]),
  title: z.string(),
  body: z.string().nullable(),
  sent_at: isoDate,
  read_at: isoDate.nullable(),
  dedupe_key: z.string().nullable(),
});

export const DumpEnvelopeSchema = z.object({
  profile: ProfileBlockSchema,
  settings: SettingsBlockSchema,
  episodes: z.array(EpisodeSchema),
  submissions: z.array(SubmissionSchema),
  agent_calls: z.array(AgentCallSchema),
  notifications: z.array(NotificationSchema),
});

export type DumpEnvelope = z.infer<typeof DumpEnvelopeSchema>;

// =============================================================================
// Result + options.
// =============================================================================

export interface ImportDumpResult {
  // Whether a `users` row was inserted (true) or already existed (false).
  user_created: boolean;
  // Count of rows inserted per section. Skipped-because-collision rows do NOT count here.
  inserted: {
    profiles: number;
    episodes: number;
    submissions: number;
    agent_calls: number;
    notifications: number;
  };
  // Count of rows skipped because a row with the same primary key already existed in the
  // target DB (idempotency / collision path).
  skipped: {
    episodes: number;
    submissions: number;
    agent_calls: number;
    notifications: number;
  };
  // Warning lines surfaced to the caller. Each collision logs one line; missing-problem and
  // other recoverable surprises log here too. Fatal issues throw instead.
  warnings: string[];
}

export interface ImportDumpOptions {
  // Optional logger sink. Defaults to console.warn so the CLI surfaces collisions verbatim.
  // Tests inject an array-pusher to assert exact log lines.
  logger?: (line: string) => void;
}

export async function importDump(
  _db: LearnProDb,
  _dump: unknown,
  _opts: ImportDumpOptions = {},
): Promise<ImportDumpResult> {
  // Implementation lands in subsequent commits. This stub keeps the type contract stable for
  // consumers and lets the round-trip-by-shape test in the next commit compile.
  throw new Error("importDump: not yet implemented");
}
