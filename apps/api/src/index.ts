import Fastify from "fastify";
import { healthPayload } from "@learnpro/shared";

const PORT = Number(process.env["PORT"] ?? 4000);
const HOST = process.env["HOST"] ?? "0.0.0.0";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => healthPayload({ service: "api" }));

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
