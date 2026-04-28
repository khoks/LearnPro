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
  loadLLMConfigFromEnv,
  type LLMProvider,
} from "@learnpro/llm";
import {
  buildSandboxProvider,
  loadSandboxConfigFromEnv,
  SandboxRequestError,
  SandboxRunRequestSchema,
  type SandboxProvider,
} from "@learnpro/sandbox";

const PORT = Number(process.env["PORT"] ?? 4000);
const HOST = process.env["HOST"] ?? "0.0.0.0";

export interface BuildServerOptions {
  policies?: PolicyRegistry;
  llm?: LLMProvider;
  sandbox?: SandboxProvider;
  interactionStore?: InteractionStore;
}

// Default impl when no store is provided — drops events on the floor. Useful for tests and
// for the dev playground when no DB is configured. The DB-backed `DrizzleInteractionStore`
// gets wired in once apps/api gets a DB client (post-STORY-005).
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

export function buildServer(opts: BuildServerOptions = {}) {
  const app = Fastify({ logger: true });
  const policies =
    opts.policies ?? buildPolicyRegistry({ config: loadPolicyConfigFromEnv(process.env) });
  const llm = opts.llm ?? defaultLLM();
  const sandbox = opts.sandbox ?? defaultSandbox();
  const interactionStore = opts.interactionStore ?? new NoopInteractionStore();

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

  // STORY-055 — batched ingestion of rich interaction telemetry (cursor focus / edits / reverts /
  // run / submit / hint / autonomy decisions). Auth attribution lands with STORY-005; until then
  // the route accepts anonymous events (`user_id` null) so the playground can ship telemetry today.
  app.post("/v1/interactions", async (req, reply) => {
    const parsed = InteractionsBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }
    const now = new Date();
    const stored: StoredInteraction[] = parsed.data.events.map((e: InteractionEvent) => ({
      type: e.type,
      payload: e.payload,
      t: e.t ? new Date(e.t) : now,
      user_id: null,
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
