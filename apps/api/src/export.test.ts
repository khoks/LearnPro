import { describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import type { DataExporter } from "./export.js";
import { MemoryRateLimiter, type RateLimiter } from "./rate-limiter.js";
import type { SessionResolver } from "./session.js";

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({
    user_id,
    org_id: "self",
    email: `${user_id}@learnpro.local`,
  });

// Always-allow / always-deny limiters for the test cases that don't care about windowing.
const alwaysAllow: RateLimiter = { tryAcquire: () => ({ allowed: true }) };
const alwaysDeny = (retry_after_seconds: number): RateLimiter => ({
  tryAcquire: () => ({ allowed: false, retry_after_seconds }),
});

// Minimal exporter that emits a fixed JSON envelope — keeps tests independent of @learnpro/db.
const fakeExporter: DataExporter = async (user_id, write) => {
  write(
    JSON.stringify({
      profile: { user_id, email: `${user_id}@x.y` },
      settings: null,
      episodes: [{ id: "e1", user_id }],
      submissions: [],
      agent_calls: [],
      notifications: [],
    }),
  );
};

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("GET /v1/export (STORY-026)", () => {
  it("returns 401 when no session", async () => {
    const app = buildServer({ dataExporter: fakeExporter, exportRateLimiter: alwaysAllow });
    const res = await app.inject({ method: "GET", url: "/v1/export" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
    await app.close();
  });

  it("returns 200 + valid JSON envelope when authenticated", async () => {
    const app = buildServer({
      dataExporter: fakeExporter,
      sessionResolver: userSession(USER_ID),
      exportRateLimiter: alwaysAllow,
    });
    const res = await app.inject({ method: "GET", url: "/v1/export" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="learnpro-export-${USER_ID}.json"`,
    );
    const body = JSON.parse(res.body) as {
      profile: { user_id: string };
      settings: unknown;
      episodes: unknown[];
      submissions: unknown[];
      agent_calls: unknown[];
      notifications: unknown[];
    };
    expect(Object.keys(body).sort()).toEqual([
      "agent_calls",
      "episodes",
      "notifications",
      "profile",
      "settings",
      "submissions",
    ]);
    expect(body.profile.user_id).toBe(USER_ID);
    expect(body.episodes).toHaveLength(1);
    await app.close();
  });

  it("returns 429 with retry_after_seconds when the rate limiter denies", async () => {
    const app = buildServer({
      dataExporter: fakeExporter,
      sessionResolver: userSession(USER_ID),
      exportRateLimiter: alwaysDeny(1234),
    });
    const res = await app.inject({ method: "GET", url: "/v1/export" });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "rate_limited", retry_after_seconds: 1234 });
    await app.close();
  });

  it("rate-limit window resets — second call after the window passes is allowed", async () => {
    let t = 1_000;
    const limiter = new MemoryRateLimiter({ windowMs: 60_000, now: () => t });
    const app = buildServer({
      dataExporter: fakeExporter,
      sessionResolver: userSession(USER_ID),
      exportRateLimiter: limiter,
    });

    const r1 = await app.inject({ method: "GET", url: "/v1/export" });
    expect(r1.statusCode).toBe(200);

    // Within the window — denied.
    t = 1_000 + 30_000;
    const r2 = await app.inject({ method: "GET", url: "/v1/export" });
    expect(r2.statusCode).toBe(429);
    const body = r2.json() as { retry_after_seconds: number };
    expect(body.retry_after_seconds).toBe(30);

    // Past the window — allowed again.
    t = 1_000 + 60_001;
    const r3 = await app.inject({ method: "GET", url: "/v1/export" });
    expect(r3.statusCode).toBe(200);

    await app.close();
  });

  it("rate-limits per-user — one user being throttled doesn't block another", async () => {
    let resolved: SessionResolver = userSession("u-throttled");
    const limiter = new MemoryRateLimiter({ windowMs: 60_000, now: () => 1_000 });
    const app = buildServer({
      dataExporter: fakeExporter,
      sessionResolver: (req) => resolved(req),
      exportRateLimiter: limiter,
    });

    const r1 = await app.inject({ method: "GET", url: "/v1/export" });
    expect(r1.statusCode).toBe(200);

    // Same user → 429.
    const r2 = await app.inject({ method: "GET", url: "/v1/export" });
    expect(r2.statusCode).toBe(429);

    // Different user → 200.
    resolved = userSession("u-other");
    const r3 = await app.inject({ method: "GET", url: "/v1/export" });
    expect(r3.statusCode).toBe(200);

    await app.close();
  });

  it("default exporter (no DB) emits a minimal valid envelope", async () => {
    // Don't inject `dataExporter` — buildServer falls back to noDbExporter.
    const app = buildServer({
      sessionResolver: userSession(USER_ID),
      exportRateLimiter: alwaysAllow,
    });
    const res = await app.inject({ method: "GET", url: "/v1/export" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "agent_calls",
      "episodes",
      "notifications",
      "profile",
      "settings",
      "submissions",
    ]);
    expect(body["profile"]).toBeNull();
    expect(body["settings"]).toBeNull();
    expect(body["episodes"]).toEqual([]);
    await app.close();
  });

  it("a multi-chunk exporter assembles into a single valid JSON envelope", async () => {
    // Pretend the exporter is the real streaming one — split the envelope across many writes.
    const chunkedExporter: DataExporter = async (user_id, write) => {
      write("{");
      write('"profile":');
      write(JSON.stringify({ user_id }));
      write(',"settings":null');
      write(',"episodes":[');
      write(JSON.stringify({ id: "e1" }));
      write(",");
      write(JSON.stringify({ id: "e2" }));
      write("]");
      write(',"submissions":[]');
      write(',"agent_calls":[]');
      write(',"notifications":[]');
      write("}");
    };
    const app = buildServer({
      dataExporter: chunkedExporter,
      sessionResolver: userSession(USER_ID),
      exportRateLimiter: alwaysAllow,
    });
    const res = await app.inject({ method: "GET", url: "/v1/export" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { episodes: Array<{ id: string }> };
    expect(body.episodes.map((e) => e.id)).toEqual(["e1", "e2"]);
    await app.close();
  });
});
