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
  ANTHROPIC_HAIKU,
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
import {
  createDb,
  deleteUserAccount,
  deleteUserVoiceTranscripts,
  drizzleExportFetcher,
  exportUserData,
  getQuietHoursConfig,
  getUserDataSummary,
  insertDeferredNotification,
  updateProfileFields,
} from "@learnpro/db";
import {
  dispatcherWithQuietHours,
  InAppChannel,
  NotificationDispatcher,
  QuietHoursDispatcher,
  WebPushChannel,
  type NotificationChannel,
} from "@learnpro/notifications";
import {
  loadExportWindowMs,
  noDbExporter,
  registerExportRoute,
  type DataExporter,
} from "./export.js";
import { buildDefaultRedactor, inertRedactor, type PiiRedactor } from "./redactor.js";
import { registerDataControlsRoutes, type DataControlsAdapters } from "./data-controls.js";
import { buildWebPushSender, configureVapid, type WebPushConfig } from "./notifications-vapid.js";
import { registerNotificationsRoutes } from "./notifications.js";
import { registerQuietHoursRoutes } from "./quiet-hours.js";
import { registerAutonomyRoutes } from "./autonomy.js";
import { registerSpacedRepetitionRoutes } from "./spaced-repetition.js";
import { registerInstallEligibleRoutes } from "./install-eligible.js";
import { registerPortfolioRoutes } from "./portfolio.js";
import { registerOnboardingRoute, type OnboardingProfileWriter } from "./onboarding.js";
import { registerRecommendationRoute } from "./recommendation.js";
import {
  MemoryRateLimiter,
  RedisRateLimiter,
  redisClientAdapter,
  type RateLimiter,
} from "./rate-limiter.js";
import { Redis } from "ioredis";
import { buildSessionResolver, type SessionResolver } from "./session.js";
import {
  buildDbSessionPlanAdapters,
  buildSessionPlanFactory,
  registerSessionPlanRoutes,
  type SessionPlanCreateInput,
  type SessionPlanFactory,
} from "./session-plan.js";
import { buildDbTodayPlanDeps, registerTodayPlanRoutes } from "./today-plan.js";
import { registerTutorRoutes, type TutorAgentFactory } from "./tutor.js";
import { buildDrizzleTutorFactory } from "./tutor-factory.js";
import {
  SESSION_PLAN_PROMPT_VERSION,
  SESSION_PLAN_SYSTEM_PROMPT,
  buildSessionPlanUserPrompt,
} from "@learnpro/prompts";
import { createPlanSessionTool, type PlanSessionDeps, type TodayPlanDeps } from "@learnpro/agent";

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
  // STORY-026 — GDPR-style data export. `dataExporter` defaults to a DB-backed exporter when
  // DATABASE_URL is set, else a minimal "no DB" exporter that emits an empty envelope (so the
  // route is testable in dev without Postgres). `exportRateLimiter` defaults to a process-local
  // MemoryRateLimiter with a 1-hour window (configurable via LEARNPRO_EXPORT_RATE_LIMIT_HOURS).
  dataExporter?: DataExporter;
  exportRateLimiter?: RateLimiter;
  // STORY-011 — tutor agent factory. Default in production wires the Drizzle/LLM-backed factory
  // when DATABASE_URL is set; tests inject a fake factory so they don't need DB or LLM.
  tutorAgentFactory?: TutorAgentFactory;
  // STORY-023 — bell-icon panel + Web Push routes. Tests inject a fake dispatcher / fake DB so
  // they don't need Postgres or VAPID keys. Production wiring lives in defaultsFromEnv() and
  // wraps the bare dispatcher with `dispatcherWithQuietHours()` (STORY-024).
  notifications?: {
    db: import("@learnpro/db").LearnProDb;
    dispatcher: NotificationDispatcher | QuietHoursDispatcher;
    vapidPublicKey: string;
  };
  // STORY-015 — session-plan factory. When provided, registers GET /v1/session-plan,
  // POST /v1/session-plan, POST /v1/session-plan/items/:slug/complete. Default in production
  // wires the Drizzle/LLM-backed factory when DATABASE_URL is set; tests inject a fake.
  sessionPlanFactory?: SessionPlanFactory;
  // STORY-024 — settings DB handle for the quiet-hours GET / PUT routes. When supplied, registers
  // /v1/settings/quiet-hours; tests inject a fake DB. Production wiring shares the same `db`
  // instance the dispatcher uses (via `defaultsFromEnv()`).
  quietHoursDb?: import("@learnpro/db").LearnProDb;
  // STORY-054 — DB handle for the `GET /v1/autonomy/state` route. When supplied, registers the
  // route; tests inject a fake DB. Production wiring shares the same `db` instance the rest of
  // the API uses (via `defaultsFromEnv()`).
  autonomyDb?: import("@learnpro/db").LearnProDb;
  // STORY-056 — PII redactor. Wired into every free-text ingestion path: voice transcripts on
  // POST /v1/interactions, user + LLM messages on POST /v1/onboarding/turn, code submissions on
  // POST /v1/tutor/episodes/:id/submit. Tests inject `inertRedactor`; production wires
  // `buildDefaultRedactor({ llm })` (regex + Haiku second pass).
  redactor?: PiiRedactor;
  // STORY-056 — user-facing data control routes. When provided, registers `GET /v1/data/summary`,
  // `DELETE /v1/data/voice`, `DELETE /v1/data/account`. Tests inject fake adapters; production
  // wires `buildDrizzleDataControlsAdapters(db)` via defaultsFromEnv.
  dataControls?: DataControlsAdapters;
  // STORY-021 — career-aware recommendation. When provided, registers `GET /v1/recommendation`.
  // Production wires the same DB instance everything else uses; tests inject a fake DB.
  recommendationDb?: import("@learnpro/db").LearnProDb;
  // STORY-031 — DB handle for the `GET /v1/spaced-repetition/due` route. Same wiring pattern as
  // quiet-hours / autonomy: tests inject a fake DB; production wires the same `db` instance.
  spacedRepetitionDb?: import("@learnpro/db").LearnProDb;
  // STORY-044 — DB handle for the `GET /v1/dashboard/install-eligible` route. Same wiring
  // pattern as the others; production shares the single `db` instance via defaultsFromEnv().
  installEligibleDb?: import("@learnpro/db").LearnProDb;
  // STORY-046 — today's-plan deps adapter. When supplied (alongside `sessionPlanFactory`),
  // registers `GET /v1/today-plan` + `POST /v1/today-plan/replan`. Tests inject a fake deps
  // object; production wires `buildDbTodayPlanDeps(db)` via defaultsFromEnv.
  todayPlanDeps?: TodayPlanDeps;
  // STORY-040 — DB handle for the portfolio routes (state / connect-init / disconnect / push /
  // settings). Same injection pattern; tests inject a fake DB. `webBaseUrl` lets tests override
  // the apps/web origin used to build the connect-init start URL.
  portfolio?: {
    db: import("@learnpro/db").LearnProDb;
    webBaseUrl?: string;
    buildClient?: import("./portfolio.js").PortfolioRouteOptions["buildClient"];
  };
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
  const dataExporter = opts.dataExporter ?? noDbExporter;
  const exportRateLimiter =
    opts.exportRateLimiter ?? new MemoryRateLimiter({ windowMs: loadExportWindowMs(process.env) });
  const redactor = opts.redactor ?? inertRedactor;

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
  // STORY-056 — voice events get their `payload.transcript` run through `redactor.redact()`
  // before persistence. The redaction summary is stamped on the row's payload so the user's
  // /settings/data view can show what categories were scrubbed.
  app.post("/v1/interactions", async (req, reply) => {
    const parsed = InteractionsBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const session = await sessionResolver(req);
    const userId = session?.user_id ?? null;
    const now = new Date();

    const stored: StoredInteraction[] = [];
    for (const e of parsed.data.events) {
      let payload: InteractionEvent["payload"] = e.payload;
      if (e.type === "voice") {
        const transcript = e.payload.transcript;
        const redaction = await redactor.redact(transcript);
        payload = {
          ...e.payload,
          transcript: redaction.redacted,
          redaction_summary: { types_scrubbed: redaction.scrubbed.map((s) => s.type) },
        };
      }
      stored.push({
        type: e.type,
        payload,
        t: e.t ? new Date(e.t) : now,
        user_id: userId,
        episode_id: e.episode_id ?? null,
      });
    }

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
    redactor,
    ...(opts.onboardingProfileWriter !== undefined && {
      profileWriter: opts.onboardingProfileWriter,
    }),
  });

  // STORY-026 — GET /v1/export. Auth-gated, per-user-rate-limited, streaming JSON envelope.
  registerExportRoute(app, {
    exporter: dataExporter,
    sessionResolver,
    rateLimiter: exportRateLimiter,
  });

  // STORY-056 — user-facing data controls. GET summary + DELETE voice + DELETE account.
  if (opts.dataControls) {
    registerDataControlsRoutes(app, { adapters: opts.dataControls, sessionResolver });
  }

  // STORY-011 — tutor agent routes. The factory tuple (TutorSession + 4 tools) is constructed
  // per-request inside `registerTutorRoutes` so each HTTP call sees a fresh state hydrated from
  // the episode row. Production wires `buildDrizzleTutorFactory` via `defaultsFromEnv()`; tests
  // inject `tutorAgentFactory` directly.
  if (opts.tutorAgentFactory) {
    registerTutorRoutes(app, { factory: opts.tutorAgentFactory, sessionResolver, redactor });
  }

  // STORY-023 — bell-icon panel + Web Push routes. Wired only when a notifications config is
  // supplied; defaultsFromEnv() builds it when DATABASE_URL is set (VAPID keys optional — the
  // routes report 503 vapid_unconfigured when missing).
  if (opts.notifications) {
    registerNotificationsRoutes(app, {
      db: opts.notifications.db,
      dispatcher: opts.notifications.dispatcher,
      vapidPublicKey: opts.notifications.vapidPublicKey,
      sessionResolver,
    });
  }

  // STORY-015 — session-plan routes. Same factory-injection pattern as the tutor routes.
  if (opts.sessionPlanFactory) {
    registerSessionPlanRoutes(app, {
      factory: opts.sessionPlanFactory,
      sessionResolver,
    });
  }

  // STORY-046 — today's-plan routes. Composes today's plan from session_plans + concept_reviews
  // + episodes count. Wired only when both today-plan deps AND session-plan factory are present
  // (the replan path needs the factory to actually re-generate when not dampened). Tests inject
  // a fake deps + fake factory; production wires both via defaultsFromEnv.
  if (opts.todayPlanDeps && opts.sessionPlanFactory) {
    registerTodayPlanRoutes(app, {
      todayPlanDeps: opts.todayPlanDeps,
      sessionPlanFactory: opts.sessionPlanFactory,
      sessionResolver,
    });
  }

  // STORY-024 — quiet-hours settings routes. Wired only when a db is supplied; defaultsFromEnv()
  // forwards the same `db` instance the notifications dispatcher uses.
  if (opts.quietHoursDb) {
    registerQuietHoursRoutes(app, { db: opts.quietHoursDb, sessionResolver });
  }

  // STORY-054 — autonomy state route. Same wiring pattern as quiet-hours.
  if (opts.autonomyDb) {
    registerAutonomyRoutes(app, { db: opts.autonomyDb, sessionResolver });
  }

  // STORY-021 — career-aware recommendation. Looks up the user's `target_role`, runs it through
  // `@learnpro/profile`'s role library, joins the recommended track slugs against the `tracks`
  // table. Wired only when a db is supplied; the /recommended page proxies to this endpoint.
  if (opts.recommendationDb) {
    registerRecommendationRoute(app, { db: opts.recommendationDb, sessionResolver });
  }

  // STORY-031 — `GET /v1/spaced-repetition/due`. Wired only when a db is supplied; defaultsFromEnv
  // forwards the same `db` instance the rest of the API uses.
  if (opts.spacedRepetitionDb) {
    registerSpacedRepetitionRoutes(app, { db: opts.spacedRepetitionDb, sessionResolver });
  }

  // STORY-044 — `GET /v1/dashboard/install-eligible`. Auth-gated; counts successful episodes to
  // decide whether the dashboard's install prompt should appear (≥3 = eligible).
  if (opts.installEligibleDb) {
    registerInstallEligibleRoutes(app, { db: opts.installEligibleDb, sessionResolver });
  }

  // STORY-040 — portfolio state / connect-init / disconnect / push / settings. Wired only when
  // a db is supplied; defaultsFromEnv forwards the same `db` instance.
  if (opts.portfolio) {
    registerPortfolioRoutes(app, {
      db: opts.portfolio.db,
      sessionResolver,
      ...(opts.portfolio.webBaseUrl !== undefined && { webBaseUrl: opts.portfolio.webBaseUrl }),
      ...(opts.portfolio.buildClient !== undefined && {
        buildClient: opts.portfolio.buildClient,
      }),
    });
  }

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

// Wires the production-default session resolver + profile writer + data exporter when
// DATABASE_URL is set. All stay undefined in dev-without-DB mode (and in tests, which inject
// their own).
//
// STORY-062 — `exportRateLimiter` is wired independently of DATABASE_URL: when REDIS_URL is
// set, we return a `RedisRateLimiter` so multiple replicas share state. Otherwise we leave it
// undefined and `buildServer` falls back to the in-memory limiter (single-process default).
function defaultsFromEnv(): {
  sessionResolver?: SessionResolver;
  onboardingProfileWriter?: OnboardingProfileWriter;
  dataExporter?: DataExporter;
  tutorAgentFactory?: TutorAgentFactory;
  notifications?: BuildServerOptions["notifications"];
  sessionPlanFactory?: SessionPlanFactory;
  quietHoursDb?: import("@learnpro/db").LearnProDb;
  autonomyDb?: import("@learnpro/db").LearnProDb;
  redactor?: PiiRedactor;
  dataControls?: DataControlsAdapters;
  recommendationDb?: import("@learnpro/db").LearnProDb;
  spacedRepetitionDb?: import("@learnpro/db").LearnProDb;
  installEligibleDb?: import("@learnpro/db").LearnProDb;
  todayPlanDeps?: TodayPlanDeps;
  portfolio?: BuildServerOptions["portfolio"];
  exportRateLimiter?: RateLimiter;
} {
  const exportRateLimiter = buildExportRateLimiterFromEnv(process.env);
  const url = process.env["DATABASE_URL"];
  if (!url) {
    return exportRateLimiter ? { exportRateLimiter } : {};
  }
  const { db } = createDb({ connectionString: url });
  const fetcher = drizzleExportFetcher(db);
  const llm = defaultLLM();
  // STORY-023 — wire the dispatcher with both channels. Web Push is optional: when VAPID keys
  // are missing, the channel still exists in the dispatcher's list but its `send()` is a no-op
  // (no subscriptions will exist either, so it'd return `no_subscriptions` even if it tried).
  const vapid = (() => {
    const publicKey = process.env["VAPID_PUBLIC_KEY"];
    const privateKey = process.env["VAPID_PRIVATE_KEY"];
    const subject = process.env["VAPID_SUBJECT"] ?? "mailto:hello@learnpro.local";
    if (!publicKey || !privateKey) return null;
    return { publicKey, privateKey, subject };
  })();
  let webPushSender: ReturnType<typeof buildWebPushSender> | null = null;
  if (vapid) {
    configureVapid(vapid as WebPushConfig);
    webPushSender = buildWebPushSender();
  }
  const channels: NotificationChannel[] = [new InAppChannel({ db })];
  if (webPushSender) {
    channels.push(new WebPushChannel({ db, sender: webPushSender }));
  }
  // STORY-024 — wrap the dispatcher with quiet-hours filtering. In-window dispatches are written
  // to `deferred_notifications` instead of being sent; the cron flusher drains the table when the
  // window opens. Notifications are deferred, never dropped (AC #4).
  const { dispatcher } = dispatcherWithQuietHours({
    channels,
    getQuietHoursConfig: (user_id) => getQuietHoursConfig(db, user_id),
    deferDelivery: async (input) => {
      await insertDeferredNotification({
        db,
        user_id: input.user_id,
        payload: input.payload,
        deliver_after: input.deliver_after,
      });
    },
  });
  return {
    sessionResolver: buildSessionResolver({ db }),
    onboardingProfileWriter: async (user_id, updates) => {
      await updateProfileFields({ db, user_id, updates });
    },
    dataExporter: async (user_id, write) => {
      await exportUserData({ user_id, write, fetcher });
    },
    tutorAgentFactory: buildDrizzleTutorFactory({
      db,
      llm,
      sandbox: defaultSandbox(),
    }),
    notifications: {
      db,
      dispatcher,
      vapidPublicKey: vapid?.publicKey ?? "",
    },
    sessionPlanFactory: buildDefaultSessionPlanFactory({ db, llm }),
    quietHoursDb: db,
    autonomyDb: db,
    recommendationDb: db,
    spacedRepetitionDb: db,
    installEligibleDb: db,
    todayPlanDeps: buildDbTodayPlanDeps({ db }),
    portfolio: { db },
    redactor: buildDefaultRedactor({ llm }),
    dataControls: {
      summary: (user_id) => getUserDataSummary(db, user_id),
      deleteVoice: (user_id) => deleteUserVoiceTranscripts(db, user_id),
      deleteAccount: (user_id) => deleteUserAccount(db, user_id),
    },
    ...(exportRateLimiter ? { exportRateLimiter } : {}),
  };
}

// STORY-062 — pick the right rate limiter based on env. When REDIS_URL is set, build a
// RedisRateLimiter against an ioredis client so multi-replica deployments share state.
// Otherwise return undefined and let buildServer fall back to the in-memory limiter.
//
// We use `lazyConnect: true` so constructing the limiter doesn't open a TCP connection — the
// connection happens on the first command (i.e. the first export call). This keeps boot
// resilient when Redis is briefly unavailable and lets the limiter be safely constructed in
// unit tests without spinning up a real Redis. `maxRetriesPerRequest: 1` prevents a stuck
// command from hanging the export endpoint indefinitely.
export function buildExportRateLimiterFromEnv(env: NodeJS.ProcessEnv): RateLimiter | undefined {
  const redisUrl = env["REDIS_URL"];
  if (!redisUrl) return undefined;
  const client = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  return new RedisRateLimiter({
    client: redisClientAdapter(client),
    windowMs: loadExportWindowMs(env),
  });
}

// Builds the production session-plan factory: planSession agent tool wired to Haiku +
// session_plans DB helpers. Lives next to defaultsFromEnv so the wiring stays close to its only
// caller.
function buildDefaultSessionPlanFactory(input: {
  db: import("@learnpro/db").LearnProDb;
  llm: LLMProvider;
}): SessionPlanFactory {
  const llm = input.llm;
  const planDeps: PlanSessionDeps = {
    async generatePlan(req) {
      const res = await llm.complete({
        messages: [
          {
            role: "user",
            content: buildSessionPlanUserPrompt({
              time_budget_min: req.time_budget_min,
              target_role: req.target_role,
              primary_goal: req.primary_goal,
              current_track: req.current_track,
              recent_episodes: req.recent_episodes,
            }),
          },
        ],
        system: SESSION_PLAN_SYSTEM_PROMPT,
        model: ANTHROPIC_HAIKU,
        role: "router",
        max_tokens: 600,
        temperature: 0.3,
        prompt_version: SESSION_PLAN_PROMPT_VERSION,
        user_id: req.user_id,
      });
      return { raw_text: res.text };
    },
  };
  const planTool = createPlanSessionTool({ deps: planDeps });
  const dbAdapters = buildDbSessionPlanAdapters({ db: input.db });
  return buildSessionPlanFactory({
    loadLatest: dbAdapters.loadLatest,
    persist: dbAdapters.persist,
    markCompleted: dbAdapters.markCompleted,
    async generate(req: SessionPlanCreateInput) {
      const out = await planTool.run({
        user_id: req.user_id,
        time_budget_min: req.time_budget_min,
      });
      return { items: out.items, fallback: out.fallback };
    },
  });
}

async function start() {
  const app = buildServer(defaultsFromEnv());
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
