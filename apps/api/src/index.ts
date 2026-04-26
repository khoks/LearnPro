import Fastify from "fastify";
import { healthPayload } from "@learnpro/shared";
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
