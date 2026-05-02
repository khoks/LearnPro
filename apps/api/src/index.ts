import Fastify from "fastify";
import {
  healthPayload,
  InteractionsBatchSchema,
  type InteractionEvent,
  type InteractionStore,
  type StoredInteraction,
} from "@learnpro/shared";
import {
  buildPolicyRegistry,
  loadPolicyConfigFromEnv,
  type PolicyRegistry,
} from "@learnpro/scoring";
import {
  AnthropicSdkTransport,
  buildLLMProvider,
  InMemoryUsageStore,
  loadLLMConfigFromEnv,
  TokenBudgetExceededError,
  type LLMProvider,
  type UsageStore,
} from "@learnpro/llm";
import {
  buildSandboxProvider,
  loadSandboxConfigFromEnv,
  SandboxRequestError,
  SandboxRunRequestSchema,
  type SandboxProvider,
} from "@learnpro/sandbox";
import { registerOnboardingRoute, type OnboardingProfileWriter } from "./onboarding.js";
import type { SessionResolver } from "./session.js";

const PORT = Number(process.env["PORT"] ?? 4000);
const HOST = process.env["HOST"] ?? "0.0.0.0";

export interface BuildServerOptions {
  policies?: PolicyRegistry;
  llm?: LLMProvider;
  sandbox?: SandboxProvider;
  interactionStore?: InteractionStore;
  // Authentication is owned by apps/web (Auth.js). apps/api validates sessions by reading the
  // shared `sessions` table directly — see buildSessionResolver in ./session.ts. Defaults to
  // `() => null` so existing tests stay anonymous.
  sessionResolver?: SessionResolver;
  usageStore?: UsageStore;
  dailyTokenLimit?: number;
  // Optional persistence callback for the onboarding agent. When wired, captured profile fields
  // are written through this hook (in apps/web → @learnpro/db.updateProfileFields). Tests inject
  // a fake to assert the call shape.
  onboardingProfileWriter?: OnboardingProfileWriter;
}

// Default impl when no store is provided — drops events on the floor. Useful for tests and
// for the dev playground when no DB is configured. The DB-backed `DrizzleInteractionStore`
// gets wired in once apps/api gets a DB client.
class NoopInteractionStore implements InteractionStore {
  async recordBatch(): Promise<void> {
    // intentional drop
  }
}

function defaultLLM(): LLMProvider {
  const config = loadLLMConfigFromEnv(process.env);
  if (config.provider === "anthropic") {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      const fail = () => {
        throw new Error("ANTHROPIC_API_KEY is not set — cannot make Anthropic calls");
      };
      return buildLLMProvider({
        config,
        anthropicTransport: {
          createMessage: () => Promise.resolve(fail()),
          streamMessage: () => ({
            [Symbol.asyncIterator]: () => ({
              next: () => Promise.resolve(fail()),
            }),
          }),
        },
      });
    }
    return buildLLMProvider({
      config,
      anthropicTransport: new AnthropicSdkTransport({ apiKey }),
    });
  }
  return buildLLMProvider({ config });
}

function defaultSandbox(): SandboxProvider {
  const config = loadSandboxConfigFromEnv(process.env);
  return buildSandboxProvider({ config });
}

const NULL_SESSION: SessionResolver = async () => null;

export function buildServer(opts: BuildServerOptions = {}) {
  const app = Fastify({ logger: true });
  const policies =
    opts.policies ?? buildPolicyRegistry({ config: loadPolicyConfigFromEnv(process.env) });
  const llm = opts.llm ?? defaultLLM();
  const sandbox = opts.sandbox ?? defaultSandbox();
  const interactionStore = opts.interactionStore ?? new NoopInteractionStore();
  const sessionResolver = opts.sessionResolver ?? NULL_SESSION;
  const usageStore = opts.usageStore ?? new InMemoryUsageStore();
  const dailyTokenLimit =
    opts.dailyTokenLimit ?? Number(process.env["LEARNPRO_DAILY_TOKEN_LIMIT"] ?? 0);

  app.get("/health", async () => healthPayload({ service: "api" }));

  app.get("/policies", async () => ({
    scoring: policies.scoring.name,
    tone: policies.tone.name,
    difficulty: policies.difficulty.name,
    autonomy: policies.autonomy.name,
  }));

  app.get("/llm", async () => ({
    provider: llm.name,
  }));

  // STORY-060 deferred AC — wired here in STORY-005 once auth was in place. Returns the user's
  // running daily token total against the configured limit. `limit_tokens: 0` means unlimited
  // (self-hosted default); `ratio` clamps to 1 in that case so callers don't divide by zero.
  app.get("/llm/usage/today", async (req, reply) => {
    const session = await sessionResolver(req);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const used = await usageStore.today(session.user_id);
    const ratio = dailyTokenLimit === 0 ? 0 : used / dailyTokenLimit;
    return reply.code(200).send({
      used_tokens: used,
      limit_tokens: dailyTokenLimit,
      ratio,
    });
  });

  app.get("/sandbox", async () => ({
    provider: sandbox.name,
  }));

  app.post("/sandbox/run", async (req, reply) => {
    const parsed = SandboxRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    try {
      const result = await sandbox.run(parsed.data);
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof SandboxRequestError) {
        req.log.warn({ err }, "sandbox provider error");
        return reply.code(502).send({ error: "sandbox_unavailable", message: err.message });
      }
      throw err;
    }
  });

  // STORY-055 — batched ingestion of rich interaction telemetry. STORY-005 wires the user_id
  // from the cross-app session lookup; unauthenticated requests still pass through as null.
  app.post("/v1/interactions", async (req, reply) => {
    const parsed = InteractionsBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const session = await sessionResolver(req);
    const userId = session?.user_id ?? null;
    const now = new Date();
    const stored: StoredInteraction[] = parsed.data.events.map((e: InteractionEvent) => ({
      type: e.type,
      payload: e.payload,
      t: e.t ? new Date(e.t) : now,
      user_id: userId,
      episode_id: e.episode_id ?? null,
    }));
    try {
      await interactionStore.recordBatch(stored);
      return reply.code(202).send({ accepted: stored.length });
    } catch (err) {
      req.log.error({ err }, "interaction store error");
      return reply
        .code(503)
        .send({ error: "interactions_unavailable", message: "telemetry store rejected the batch" });
    }
  });

  // STORY-053 — POST /v1/onboarding/turn. Conversational onboarding agent: orchestrates a
  // multi-turn warm-coach chat, extracts profile-field updates per turn, gracefully exits when
  // the user disengages or caps trip. Fallback to a deterministic 3-question form when
  // LEARNPRO_DISABLE_ONBOARDING_LLM=1 keeps onboarding never-blocking even without an LLM key.
  registerOnboardingRoute(app, {
    llm,
    sessionResolver,
    ...(opts.onboardingProfileWriter !== undefined && {
      profileWriter: opts.onboardingProfileWriter,
    }),
  });

  // STORY-060 deferred AC — friendly 429 mapping for the per-user daily token budget. Any handler
  // that calls into the LLM provider can throw `TokenBudgetExceededError`; this hook catches it
  // before Fastify's default 500 path so the playground can render the friendly message AC from
  // STORY-012. Non-budget errors fall through to Fastify's default error formatter.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof TokenBudgetExceededError) {
      req.log.warn({ user_id: err.user_id, used: err.used, limit: err.limit }, "daily budget hit");
      return reply.code(429).send({
        error: "daily_budget_exceeded",
        message: `Daily token budget reached (${err.used}/${err.limit}). Resets at UTC midnight.`,
      });
    }
    req.log.error({ err }, "unhandled error");
    const status =
      err && typeof err === "object" && "statusCode" in err && typeof err.statusCode === "number"
        ? err.statusCode
        : 500;
    return reply.code(status).send({ error: "internal_error" });
  });

  return app;
}

async function start() {
  const app = buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain) {
  void start();
}
