// STORY-063 — End-to-end MVP-loop test harness.
//
// Path B (vitest fetch-driver against a real listening Fastify): the harness gives the e2e test
// suite a single entry point to spin up a Fastify instance with deterministic fakes for the LLM
// and sandbox, real Drizzle wiring for everything else, and a fixed user_id so cookies / Auth.js
// can be skipped entirely. Lives next to the production wiring (apps/api/src/index.ts) so the
// fakes can reach into `buildServer`'s injection points without an exported test seam.
//
// What's faked:
//   - LLMProvider — queue-driven `FakeLLMProvider` returns scripted texts. Every `complete()` call
//     consumes one entry; once exhausted, returns a benign rubric stub so the grader's fallback
//     never has to kick in. Telemetry sink IS wired so `agent_calls` rows still land.
//   - SandboxProvider — `AlwaysPassSandbox` emits the harness verdict-pass token regardless of
//     code; the grader's `parseVerdict` reads it as ok. No real container shells out.
//
// What's REAL:
//   - Postgres (via DATABASE_URL). Migrations applied before the harness boots.
//   - Drizzle tutor factory (assignProblem → real episodes row, grade → real submissions row,
//     updateProfile → real skill_scores + xp_awards + users.xp).
//   - The `interactions` table receives every event sent through `POST /v1/interactions`.
//   - The `agent_calls` table receives every fake-LLM call (telemetry is sink-driven).
//
// Why no Anthropic key required: the FakeLLMProvider's transport never makes a network call;
// each `createMessage` returns a queued text instantly.

import {
  AnthropicProvider,
  DEFAULT_ROLE_MODEL_MAP,
  type AnthropicCreateParams,
  type AnthropicMessageResponse,
  type AnthropicTransport,
  type LLMProvider,
  type LLMTelemetryEvent,
  type LLMTelemetrySink,
} from "@learnpro/llm";
import {
  DrizzleInteractionStore,
  DrizzleLLMTelemetrySink,
  createDb,
  drizzleExportFetcher,
  exportUserData,
  updateProfileFields,
  type LearnProDb,
} from "@learnpro/db";
import { VERDICT_PASS_TOKEN } from "@learnpro/problems";
import { streamChunksFromRun } from "@learnpro/sandbox";
import type {
  SandboxLanguage,
  SandboxProvider,
  SandboxRunChunk,
  SandboxRunRequest,
  SandboxRunResponse,
} from "@learnpro/sandbox";
import { buildServer, type BuildServerOptions } from "../index.js";
import { regexOnlyRedactor } from "../redactor.js";
import type { SessionResolver } from "../session.js";
import { buildDrizzleTutorFactory } from "../tutor-factory.js";

// Drives the fake LLM in the order the test scripts expect. Once empty, falls through to a benign
// rubric JSON so any unexpected `complete()` doesn't crash the grader's fallback. The transport is
// passed to `AnthropicProvider` so the existing telemetry sink + cost-pricing pipeline still runs.
export class FakeLLMQueue {
  private readonly queue: string[];
  public calls = 0;

  constructor(initial: string[] = []) {
    this.queue = [...initial];
  }

  enqueue(text: string): void {
    this.queue.push(text);
  }

  // Generic stub the grader will accept (correctness=1) — used when the queue runs dry. Not the
  // happy path, but better than throwing during a test that incidentally calls into the LLM.
  static defaultStub(): string {
    return JSON.stringify({
      rubric: { correctness: 1, idiomatic: 0.8, edge_case_coverage: 0.7 },
      prose_explanation: "ok",
    });
  }

  next(): string {
    this.calls += 1;
    return this.queue.shift() ?? FakeLLMQueue.defaultStub();
  }
}

export interface BuildFakeLLMOptions {
  queue: FakeLLMQueue;
  // Optional sink — the e2e suite passes a `DrizzleLLMTelemetrySink` so `agent_calls` rows land
  // in the real DB. Tests of the harness itself can pass a sink that just buffers events.
  telemetry?: LLMTelemetrySink;
}

export function buildFakeLLM(opts: BuildFakeLLMOptions): LLMProvider {
  const transport: AnthropicTransport = {
    async createMessage(params: AnthropicCreateParams): Promise<AnthropicMessageResponse> {
      const text = opts.queue.next();
      return {
        model: params.model,
        stop_reason: "end_turn",
        usage: { input_tokens: 50, output_tokens: 30 },
        content: [{ type: "text", text }],
      };
    },
    streamMessage() {
      return {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.resolve({ value: undefined, done: true as const }),
        }),
      };
    },
  };
  const sinkFromOpts = opts.telemetry;
  const sink: LLMTelemetrySink = sinkFromOpts ?? { record: () => {} };
  return new AnthropicProvider({
    transport,
    models: DEFAULT_ROLE_MODEL_MAP,
    telemetry: sink,
  });
}

// Sandbox stand-in that pretends every hidden test passed. The harness wraps the user's solve()
// in a per-language verdict shell; the grader looks for `__LEARNPRO_PASS__` in stdout, so emitting
// just that line is enough to convince it.
export class AlwaysPassSandbox implements SandboxProvider {
  readonly name = "fake-sandbox-always-pass";
  public lastReq: SandboxRunRequest | null = null;
  public calls = 0;

  async run(req: SandboxRunRequest): Promise<SandboxRunResponse> {
    this.lastReq = req;
    this.calls += 1;
    return {
      stdout: `${VERDICT_PASS_TOKEN}\n`,
      stderr: "",
      exit_code: 0,
      duration_ms: 1,
      killed_by: null,
      language: req.language as SandboxLanguage,
      runtime_version: "fake-1.0.0",
    };
  }

  runStream(req: SandboxRunRequest, signal?: AbortSignal): AsyncIterable<SandboxRunChunk> {
    return streamChunksFromRun(() => this.run(req), signal);
  }
}

// A SessionResolver that ignores cookies and returns the supplied user_id every time. Lets the
// e2e test bypass the Auth.js cookie roundtrip while still exercising every authenticated route
// the production app uses.
export function fixedUserSession(input: {
  user_id: string;
  org_id?: string;
  email?: string;
}): SessionResolver {
  const org_id = input.org_id ?? "self";
  const email = input.email ?? "e2e-mvp-loop@learnpro.local";
  return async () => ({ user_id: input.user_id, org_id, email });
}

export interface BuildE2eServerOptions {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
  llm: LLMProvider;
  sandbox: SandboxProvider;
}

// Wires the production Fastify with real Drizzle helpers + injected fake LLM/sandbox + a
// fixed-user resolver. Mirrors the relevant subset of `defaultsFromEnv()` in apps/api/src/index.ts;
// kept separate so the e2e harness doesn't have to honour the production env-driven branches
// (VAPID, daily-token-limit, retention sweeps, etc.) the test loop doesn't exercise.
export function buildE2eServer(opts: BuildE2eServerOptions) {
  const sessionResolver = fixedUserSession({
    user_id: opts.user_id,
    ...(opts.org_id !== undefined && { org_id: opts.org_id }),
  });
  const interactionStore = new DrizzleInteractionStore({ db: opts.db });
  const fetcher = drizzleExportFetcher(opts.db);
  const tutorAgentFactory = buildDrizzleTutorFactory({
    db: opts.db,
    llm: opts.llm,
    sandbox: opts.sandbox,
  });

  const buildOpts: BuildServerOptions = {
    sessionResolver,
    llm: opts.llm,
    sandbox: opts.sandbox,
    interactionStore,
    tutorAgentFactory,
    onboardingProfileWriter: async (user_id, updates) => {
      await updateProfileFields({ db: opts.db, user_id, updates });
    },
    dataExporter: async (user_id, write) => {
      await exportUserData({ user_id, write, fetcher });
    },
    recommendationDb: opts.db,
    redactor: regexOnlyRedactor(),
  };

  return buildServer(buildOpts);
}

// Convenience factory for the e2e suite: build the DB connection + a fake-LLM (with telemetry
// flowing into agent_calls) + a fake sandbox + the wired server, all in one call. The caller is
// responsible for closing both `app` and `pool`.
export interface BuildE2eFromEnvOptions {
  databaseUrl: string;
  user_id: string;
  org_id?: string;
  llmQueue?: FakeLLMQueue;
}

// Pool type is inferred from createDb's return so we don't have to add `pg` as a direct
// devDependency on apps/api just for the type alias.
type CreateDbResult = ReturnType<typeof createDb>;

export interface BuildE2eFromEnvResult {
  db: LearnProDb;
  pool: CreateDbResult["pool"];
  app: ReturnType<typeof buildServer>;
  llmQueue: FakeLLMQueue;
  sandbox: AlwaysPassSandbox;
}

export function buildE2eFromEnv(opts: BuildE2eFromEnvOptions): BuildE2eFromEnvResult {
  const { db, pool } = createDb({ connectionString: opts.databaseUrl });
  const queue = opts.llmQueue ?? new FakeLLMQueue();
  const sandbox = new AlwaysPassSandbox();
  const telemetry = new DrizzleLLMTelemetrySink({ db });
  const llm = buildFakeLLM({ queue, telemetry });
  const app = buildE2eServer({
    db,
    user_id: opts.user_id,
    ...(opts.org_id !== undefined && { org_id: opts.org_id }),
    llm,
    sandbox,
  });
  return { db, pool, app, llmQueue: queue, sandbox };
}

// Helper for the e2e suite — pulls a single agent_calls row's worth of telemetry events through
// the sink before asserting. The DrizzleLLMTelemetrySink is fire-and-forget, so a brief polling
// loop is needed to avoid races between the LLM call returning and the row landing.
export async function waitForAgentCallRows(opts: {
  db: LearnProDb;
  user_id: string;
  expected: number;
  timeoutMs?: number;
}): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? 2000);
  const { agent_calls } = await import("@learnpro/db");
  const { eq } = await import("drizzle-orm");
  while (Date.now() < deadline) {
    const rows = await opts.db
      .select({ id: agent_calls.id })
      .from(agent_calls)
      .where(eq(agent_calls.user_id, opts.user_id));
    if (rows.length >= opts.expected) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

// Re-export so the e2e test only has to import from one module.
export type { LLMTelemetryEvent };
