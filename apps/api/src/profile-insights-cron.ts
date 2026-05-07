import { z } from "zod";
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import {
  insertInsight,
  listEpisodesForSynthesis,
  listLatestInsights,
  type LearnProDb,
} from "@learnpro/db";
import { runProfileInsightsAgent, type ProfileInsightsAgentOutput } from "@learnpro/agent";
import type { LLMProvider } from "@learnpro/llm";

// STORY-033 — BullMQ wiring for the async profile-update agent.
//
// At session-end, the apps/api tutor finish-handler calls `enqueueProfileInsightsJob` to push
// `{ user_id, episode_id }` onto a queue. A separate worker (boot-time singleton, started in
// defaultsFromEnv) drains the queue, reads the user's last 30 days of episodes, calls Haiku via
// the existing LLMProvider (which writes the agent_calls telemetry row + applies the budget
// gate), and persists the resulting 1-3 insights.
//
// REDIS_URL gate: if unset, the queue + worker stay null. The enqueue helper is then a no-op
// (logs a warning once and returns) so self-hosted dev without Redis still works end-to-end —
// the user-facing tutor never blocks on this side path.

export const PROFILE_INSIGHTS_QUEUE_NAME = "profile-insights";

export const ProfileInsightsJobPayloadSchema = z.object({
  user_id: z.string().uuid(),
  episode_id: z.string().uuid(),
  // Optional: triggers an empty-window synthesis (tests can drop this; production sets it true
  // to capture the moment). Helps trace which close kicked off this job in the agent_calls row.
  triggered_at_ms: z.number().int().nonnegative().optional(),
});
export type ProfileInsightsJobPayload = z.infer<typeof ProfileInsightsJobPayloadSchema>;

export interface ProfileInsightsCronOptions {
  db: LearnProDb;
  llm: LLMProvider;
  // BullMQ connection options (host/port/etc.) or a pre-built ioredis client. The default-path
  // production wiring constructs this from REDIS_URL; tests can pass a mock connection.
  connection: ConnectionOptions;
  // Defaults to 30. Lower in tests to make the synthesis cheaper.
  window_days?: number;
  // How many previous insights to surface to the prompt as "avoid repeating verbatim". Defaults
  // to 5; bumping this increases prompt cost slightly.
  previous_insights_for_prompt?: number;
}

export interface ProfileInsightsCronHandle {
  queue: Queue<ProfileInsightsJobPayload>;
  worker: Worker<ProfileInsightsJobPayload, ProfileInsightsRunResult>;
  // Closes both the worker and the queue. Called from process shutdown hooks (or tests).
  close(): Promise<void>;
}

export interface ProfileInsightsRunResult {
  user_id: string;
  episode_id: string;
  insights_written: number;
  filtered_out: number;
  fallback_used: boolean;
  skipped_thin_data: boolean;
  episode_count_in_window: number;
  duration_ms: number;
}

// Boot-time singleton constructor. Returns a handle holding the queue + worker; the caller is
// responsible for closing both at shutdown. Workers automatically pick up jobs as soon as the
// constructor returns, so there's nothing extra to call.
export function buildProfileInsightsCron(
  opts: ProfileInsightsCronOptions,
): ProfileInsightsCronHandle {
  const queue = new Queue<ProfileInsightsJobPayload>(PROFILE_INSIGHTS_QUEUE_NAME, {
    connection: opts.connection,
  });
  const worker = new Worker<ProfileInsightsJobPayload, ProfileInsightsRunResult>(
    PROFILE_INSIGHTS_QUEUE_NAME,
    async (job) => runProfileInsightsJob(job, opts),
    { connection: opts.connection },
  );
  return {
    queue,
    worker,
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}

// Pulled out of `buildProfileInsightsCron` so tests can drive it without a real Redis. The job
// is bullmq-shape but the function is decoupled — a fake `Job<ProfileInsightsJobPayload>` works.
export async function runProfileInsightsJob(
  job: Pick<Job<ProfileInsightsJobPayload>, "data">,
  opts: Omit<ProfileInsightsCronOptions, "connection">,
): Promise<ProfileInsightsRunResult> {
  const start = Date.now();
  const data = ProfileInsightsJobPayloadSchema.parse(job.data);
  const windowDays = opts.window_days ?? 30;
  const previousLimit = opts.previous_insights_for_prompt ?? 5;

  const [episodes, previous] = await Promise.all([
    listEpisodesForSynthesis(opts.db, data.user_id, windowDays),
    listLatestInsights(opts.db, data.user_id, previousLimit),
  ]);

  const previousTexts = previous.map((p) => p.insight_text);
  const result: ProfileInsightsAgentOutput = await runProfileInsightsAgent({
    llm: opts.llm,
    user_id: data.user_id,
    recent_episodes: episodes,
    ...(previousTexts.length > 0 && { previous_insight_texts: previousTexts }),
  });

  let written = 0;
  for (const insight of result.insights) {
    await insertInsight(opts.db, {
      user_id: data.user_id,
      insight_text: insight.text,
      concept_tags: insight.concept_tags,
      episodes_covered: insight.episodes_referenced,
    });
    written += 1;
  }

  return {
    user_id: data.user_id,
    episode_id: data.episode_id,
    insights_written: written,
    filtered_out: result.filtered_out,
    fallback_used: result.fallback_used,
    skipped_thin_data: result.skipped_thin_data,
    episode_count_in_window: episodes.length,
    duration_ms: Date.now() - start,
  };
}

export interface EnqueueDeps {
  // The handle returned by `buildProfileInsightsCron` — null when REDIS_URL is unset (the
  // self-hosted-without-Redis dev case). The function is a soft no-op then.
  cron: ProfileInsightsCronHandle | null;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

// Push a synthesis job onto the queue. Idempotency is best-effort — re-running for the same
// (user, episode) is harmless (the agent will re-synthesize over the same window), but the
// caller should still avoid duplicate enqueues to keep cost down. We intentionally do NOT use a
// jobId-based dedupe because the user might want a refresh on a manual replay path later.
export async function enqueueProfileInsightsJob(
  payload: ProfileInsightsJobPayload,
  deps: EnqueueDeps,
): Promise<{ enqueued: boolean }> {
  const validated = ProfileInsightsJobPayloadSchema.parse(payload);
  if (!deps.cron) {
    deps.log?.("profile-insights: cron not wired (REDIS_URL unset) — skipping enqueue", {
      user_id: validated.user_id,
      episode_id: validated.episode_id,
    });
    return { enqueued: false };
  }
  await deps.cron.queue.add("synthesize", validated, {
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
  });
  return { enqueued: true };
}

// Helper exposed for the prod boot path: returns a redis connection options object the worker +
// queue can both use. Returns null when REDIS_URL is unset so the caller can short-circuit.
export function buildBullConnectionFromEnv(env: NodeJS.ProcessEnv): ConnectionOptions | null {
  const url = env["REDIS_URL"];
  if (!url) return null;
  const parsed = new URL(url);
  const opts: ConnectionOptions = {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.pathname && parsed.pathname.length > 1
      ? { db: Number(parsed.pathname.slice(1)) }
      : {}),
    maxRetriesPerRequest: null,
  };
  return opts;
}
