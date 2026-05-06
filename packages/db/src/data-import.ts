import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { LearnProDb } from "./client.js";
import {
  agent_calls,
  episodes,
  notifications,
  problems,
  profiles,
  SELF_HOSTED_ORG_ID,
  submissions,
  users,
} from "./schema.js";

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
  db: LearnProDb,
  dump: unknown,
  opts: ImportDumpOptions = {},
): Promise<ImportDumpResult> {
  const envelope = DumpEnvelopeSchema.parse(dump);
  const sink = opts.logger ?? ((line: string) => console.warn(line));

  const result: ImportDumpResult = {
    user_created: false,
    inserted: { profiles: 0, episodes: 0, submissions: 0, agent_calls: 0, notifications: 0 },
    skipped: { episodes: 0, submissions: 0, agent_calls: 0, notifications: 0 },
    warnings: [],
  };

  // Mirrors every warning into the result so callers can read them programmatically — the
  // CLI prints them to stderr; integration tests assert on the array.
  const log = (line: string): void => {
    result.warnings.push(line);
    sink(line);
  };

  // The whole import runs inside a single transaction so a partial failure (e.g. missing
  // problem_id half-way through episodes) leaves no half-imported user behind.
  await db.transaction(async (tx) => {
    if (envelope.profile === null) {
      // Nothing to import — the dump corresponds to a user that didn't exist when exported.
      // The export shape allows this (used as a "user-was-deleted" snapshot); honor it.
      log("[importDump] dump.profile is null — nothing to import");
      return;
    }

    const userIdToImport = envelope.profile.user_id;

    // ----- users row -----
    const existingUser = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userIdToImport))
      .limit(1);

    if (existingUser.length === 0) {
      await tx.insert(users).values({
        id: userIdToImport,
        org_id: envelope.profile.org_id || SELF_HOSTED_ORG_ID,
        email: envelope.profile.email,
        name: envelope.profile.name,
        image: envelope.profile.image,
        emailVerified: envelope.profile.emailVerified
          ? new Date(envelope.profile.emailVerified)
          : null,
        xp: envelope.profile.xp,
        streak_grace_days_remaining: envelope.profile.streak_grace_days_remaining,
        streak_grace_last_replenished_at: envelope.profile.streak_grace_last_replenished_at
          ? new Date(envelope.profile.streak_grace_last_replenished_at)
          : null,
        created_at: new Date(envelope.profile.created_at),
      });
      result.user_created = true;
    } else {
      log(
        `[importDump] users row ${userIdToImport} already exists — keeping existing identity columns`,
      );
    }

    // ----- profiles row (UPSERT) -----
    if (envelope.profile.profile !== null) {
      const profileBlock = envelope.profile.profile;
      const profileRow = {
        user_id: userIdToImport,
        org_id: envelope.profile.org_id || SELF_HOSTED_ORG_ID,
        target_role: profileBlock.target_role,
        time_budget_min: profileBlock.time_budget_min,
        primary_goal: profileBlock.primary_goal,
        self_assessed_level: profileBlock.self_assessed_level,
        language_comfort: profileBlock.language_comfort ?? null,
        updated_at: new Date(profileBlock.updated_at),
      };

      await tx
        .insert(profiles)
        .values(profileRow)
        .onConflictDoUpdate({
          target: profiles.user_id,
          set: {
            target_role: profileRow.target_role,
            time_budget_min: profileRow.time_budget_min,
            primary_goal: profileRow.primary_goal,
            self_assessed_level: profileRow.self_assessed_level,
            language_comfort: profileRow.language_comfort,
            updated_at: profileRow.updated_at,
          },
        });
      result.inserted.profiles = 1;
    }

    // ----- pre-flight: every referenced problem_id must exist in the target instance.
    // The export envelope intentionally omits the problems catalog (self-hosted migrations
    // assume both instances seed from the same `@learnpro/problems` bank). A missing
    // problem_id is fatal — fail with a clear error before inserting anything.
    const referencedProblemIds = Array.from(new Set(envelope.episodes.map((e) => e.problem_id)));
    if (referencedProblemIds.length > 0) {
      const existingProblems = await tx
        .select({ id: problems.id })
        .from(problems)
        .where(inArray(problems.id, referencedProblemIds));
      const existingIds = new Set(existingProblems.map((p) => p.id));
      const missing = referencedProblemIds.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        throw new Error(
          `[importDump] target DB is missing ${missing.length} problem_id(s) referenced by ` +
            `the dump's episodes — seed the same problem catalog before importing. ` +
            `First missing: ${missing[0]}`,
        );
      }
    }

    // ----- episodes (FK: user, problem) -----
    // ON CONFLICT DO NOTHING + RETURNING id lets us detect collisions: returned-id-set is
    // the rows actually inserted; everything else collided on the (id) primary key.
    if (envelope.episodes.length > 0) {
      const epRows = envelope.episodes.map((ep) => ({
        id: ep.id,
        org_id: ep.org_id || SELF_HOSTED_ORG_ID,
        user_id: ep.user_id,
        problem_id: ep.problem_id,
        started_at: new Date(ep.started_at),
        finished_at: ep.finished_at ? new Date(ep.finished_at) : null,
        hints_used: ep.hints_used,
        attempts: ep.attempts,
        final_outcome: ep.final_outcome,
        time_to_solve_ms: ep.time_to_solve_ms,
        // `embedding` is intentionally omitted — re-derivable from the next tutor call.
        interactions_summary: ep.interactions_summary ?? null,
      }));
      const inserted = await tx
        .insert(episodes)
        .values(epRows)
        .onConflictDoNothing({ target: episodes.id })
        .returning({ id: episodes.id });
      const insertedSet = new Set(inserted.map((r) => r.id));
      result.inserted.episodes = inserted.length;
      for (const ep of envelope.episodes) {
        if (!insertedSet.has(ep.id)) {
          result.skipped.episodes++;
          log(`[importDump] episodes row ${ep.id} already exists — skipped`);
        }
      }
    }

    // ----- submissions (FK: episode) -----
    if (envelope.submissions.length > 0) {
      const subRows = envelope.submissions.map((sub) => ({
        id: sub.id,
        org_id: sub.org_id || SELF_HOSTED_ORG_ID,
        episode_id: sub.episode_id,
        submitted_at: new Date(sub.submitted_at),
        code: sub.code,
        passed: sub.passed,
        runtime_ms: sub.runtime_ms,
      }));
      const inserted = await tx
        .insert(submissions)
        .values(subRows)
        .onConflictDoNothing({ target: submissions.id })
        .returning({ id: submissions.id });
      const insertedSet = new Set(inserted.map((r) => r.id));
      result.inserted.submissions = inserted.length;
      for (const sub of envelope.submissions) {
        if (!insertedSet.has(sub.id)) {
          result.skipped.submissions++;
          log(`[importDump] submissions row ${sub.id} already exists — skipped`);
        }
      }
    }

    // ----- agent_calls (FK: user, optional episode) -----
    if (envelope.agent_calls.length > 0) {
      const callRows = envelope.agent_calls.map((c) => ({
        id: c.id,
        org_id: c.org_id || SELF_HOSTED_ORG_ID,
        user_id: c.user_id,
        session_id: c.session_id,
        episode_id: c.episode_id,
        provider: c.provider,
        model: c.model,
        role: c.role,
        task: c.task,
        prompt_version: c.prompt_version,
        input_tokens: c.input_tokens,
        output_tokens: c.output_tokens,
        cached_tokens: c.cached_tokens,
        cost_usd: c.cost_usd,
        pricing_version: c.pricing_version,
        tool_used: c.tool_used,
        latency_ms: c.latency_ms,
        ok: c.ok,
        called_at: new Date(c.called_at),
      }));
      const inserted = await tx
        .insert(agent_calls)
        .values(callRows)
        .onConflictDoNothing({ target: agent_calls.id })
        .returning({ id: agent_calls.id });
      const insertedSet = new Set(inserted.map((r) => r.id));
      result.inserted.agent_calls = inserted.length;
      for (const c of envelope.agent_calls) {
        if (!insertedSet.has(c.id)) {
          result.skipped.agent_calls++;
          log(`[importDump] agent_calls row ${c.id} already exists — skipped`);
        }
      }
    }

    // ----- notifications (FK: user) -----
    if (envelope.notifications.length > 0) {
      const notifRows = envelope.notifications.map((n) => ({
        id: n.id,
        org_id: n.org_id || SELF_HOSTED_ORG_ID,
        user_id: n.user_id,
        channel: n.channel,
        title: n.title,
        body: n.body,
        sent_at: new Date(n.sent_at),
        read_at: n.read_at ? new Date(n.read_at) : null,
        dedupe_key: n.dedupe_key,
      }));
      const inserted = await tx
        .insert(notifications)
        .values(notifRows)
        .onConflictDoNothing({ target: notifications.id })
        .returning({ id: notifications.id });
      const insertedSet = new Set(inserted.map((r) => r.id));
      result.inserted.notifications = inserted.length;
      for (const n of envelope.notifications) {
        if (!insertedSet.has(n.id)) {
          result.skipped.notifications++;
          log(`[importDump] notifications row ${n.id} already exists — skipped`);
        }
      }
    }
  });

  return result;
}
