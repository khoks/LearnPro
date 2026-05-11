import { z } from "zod";
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import {
  createCheatsheet,
  findCheatsheetForEpisodes,
  type CheatsheetView,
  type LearnProDb,
} from "@learnpro/db";
import { cheatsheetAgent, entriesToMarkdown, type CheatsheetAgentResult } from "@learnpro/agent";
import type { LLMProvider } from "@learnpro/llm";
import type { CheatsheetEpisodeFetcher } from "./cheatsheet.js";

// STORY-041a — BullMQ trigger for cheatsheet generation. Mirrors STORY-033's profile-insights
// cron, plus an extra idempotency gate (skip when a cheatsheet already covers this exact
// episode set) since cheatsheets — unlike insights — are uniquely keyed off the input episodes.
//
// At session-end, the apps/api tutor finish-handler calls `enqueueCheatsheetJob` to push
// `{ user_id, episode_ids }` onto the queue. A separate worker (boot-time singleton, started
// in defaultsFromEnv) drains the queue, checks idempotency, fetches the per-episode context
// via the same `CheatsheetEpisodeFetcher` the synchronous POST route uses, calls `cheatsheetAgent`
// (Haiku), and persists via `createCheatsheet`.
//
// REDIS_URL gate: if unset, the queue + worker stay null. The enqueue helper is then a no-op
// (logs a warning once and returns) so self-hosted dev without Redis still works end-to-end —
// the user-facing tutor never blocks on this side path. The synchronous `POST /v1/cheatsheets`
// route stays as the manual-regenerate operator path AND the dev-without-Redis fallback.

export const CHEATSHEET_QUEUE_NAME = "cheatsheet";

export const CheatsheetJobPayloadSchema = z.object({
  user_id: z.string().uuid(),
  episode_ids: z.array(z.string().uuid()).min(1).max(20),
  triggered_at_ms: z.number().int().nonnegative().optional(),
});
export type CheatsheetJobPayload = z.infer<typeof CheatsheetJobPayloadSchema>;

export interface CheatsheetCronOptions {
  db: LearnProDb;
  llm: LLMProvider;
  // Source of per-episode context for the agent. Production wires the same
  // `buildDbCheatsheetEpisodeFetcher(db)` the synchronous route uses; tests inject a fake.
  episodeFetcher: CheatsheetEpisodeFetcher;
  // BullMQ connection options (host/port/etc.) or a pre-built ioredis client. The default-path
  // production wiring constructs this from REDIS_URL; tests can pass a mock connection.
  connection: ConnectionOptions;
  // Override the agent's `max_entries` (defaults to 6). Mainly for tests.
  max_entries?: number;
}

export interface CheatsheetCronHandle {
  queue: Queue<CheatsheetJobPayload>;
  worker: Worker<CheatsheetJobPayload, CheatsheetRunResult>;
  close(): Promise<void>;
}

export interface CheatsheetRunResult {
  user_id: string;
  episode_ids: string[];
  cheatsheet_id: string | null;
  generated: boolean;
  // True when `findCheatsheetForEpisodes` matched and we skipped the LLM call entirely.
  skipped_idempotent: boolean;
  // True when the fetcher returned zero episodes (none belonged to the user / none existed).
  skipped_no_episodes: boolean;
  // True when the agent produced zero entries (parse failure or empty input). Not a skip — the
  // empty cheatsheet is still persisted so the /profile history shows the date.
  fallback_used: boolean;
  duration_ms: number;
}

// Boot-time singleton constructor. The caller is responsible for `close()` at shutdown.
export function buildCheatsheetCron(opts: CheatsheetCronOptions): CheatsheetCronHandle {
  const queue = new Queue<CheatsheetJobPayload>(CHEATSHEET_QUEUE_NAME, {
    connection: opts.connection,
  });
  const worker = new Worker<CheatsheetJobPayload, CheatsheetRunResult>(
    CHEATSHEET_QUEUE_NAME,
    async (job) => runCheatsheetJob(job, opts),
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

// Pulled out of `buildCheatsheetCron` so tests can drive it without a real Redis. The job is
// bullmq-shape but the function is decoupled — a fake `Job<CheatsheetJobPayload>` works.
export async function runCheatsheetJob(
  job: Pick<Job<CheatsheetJobPayload>, "data">,
  opts: Omit<CheatsheetCronOptions, "connection">,
): Promise<CheatsheetRunResult> {
  const start = Date.now();
  const data = CheatsheetJobPayloadSchema.parse(job.data);
  const sortedEpisodeIds = [...data.episode_ids].sort();

  const existing = await findCheatsheetForEpisodes(opts.db, data.user_id, sortedEpisodeIds);
  if (existing) {
    return {
      user_id: data.user_id,
      episode_ids: sortedEpisodeIds,
      cheatsheet_id: existing.id,
      generated: false,
      skipped_idempotent: true,
      skipped_no_episodes: false,
      fallback_used: false,
      duration_ms: Date.now() - start,
    };
  }

  const episodes = await opts.episodeFetcher.fetch({
    user_id: data.user_id,
    episode_ids: sortedEpisodeIds,
  });
  if (episodes.length === 0) {
    return {
      user_id: data.user_id,
      episode_ids: sortedEpisodeIds,
      cheatsheet_id: null,
      generated: false,
      skipped_idempotent: false,
      skipped_no_episodes: true,
      fallback_used: false,
      duration_ms: Date.now() - start,
    };
  }

  const agentResult: CheatsheetAgentResult = await cheatsheetAgent({
    llm: opts.llm,
    user_id: data.user_id,
    episodes,
    ...(opts.max_entries !== undefined ? { max_entries: opts.max_entries } : {}),
  });

  const markdown = entriesToMarkdown(agentResult.entries, { date: new Date() });
  const view: CheatsheetView = await createCheatsheet(opts.db, {
    user_id: data.user_id,
    episodes_covered: sortedEpisodeIds,
    entries: agentResult.entries,
    markdown_content: markdown,
  });

  return {
    user_id: data.user_id,
    episode_ids: sortedEpisodeIds,
    cheatsheet_id: view.id,
    generated: true,
    skipped_idempotent: false,
    skipped_no_episodes: false,
    fallback_used: agentResult.fallback_used,
    duration_ms: Date.now() - start,
  };
}

export interface EnqueueCheatsheetDeps {
  // Null when REDIS_URL is unset — the function then logs once and returns. Mirrors STORY-033.
  cron: CheatsheetCronHandle | null;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export async function enqueueCheatsheetJob(
  payload: CheatsheetJobPayload,
  deps: EnqueueCheatsheetDeps,
): Promise<{ enqueued: boolean }> {
  const validated = CheatsheetJobPayloadSchema.parse(payload);
  if (!deps.cron) {
    deps.log?.("cheatsheet: cron not wired (REDIS_URL unset) — skipping enqueue", {
      user_id: validated.user_id,
      episode_ids: validated.episode_ids,
    });
    return { enqueued: false };
  }
  await deps.cron.queue.add("generate", validated, {
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
  });
  return { enqueued: true };
}
