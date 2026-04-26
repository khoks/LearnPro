import { describe, it, expect } from "vitest";
import { buildServer } from "./index.js";

describe("apps/api", () => {
  it("GET /health returns ok payload", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("api");
    await app.close();
  });
});
