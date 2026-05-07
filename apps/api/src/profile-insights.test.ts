import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

// STORY-033 — pure-Fastify tests for `GET /v1/profile-insights`. We mock @learnpro/db's
// helpers; the real Drizzle queries are integration-tested in
// `packages/db/src/profile-insights.test.ts`.

const mockState: {
  insights: Array<{
    id: string;
    user_id: string;
    org_id: string;
    insight_text: string;
    concept_tags: string[];
    referenced_count: number;
    created_at: Date;
    expires_at: Date | null;
  }>;
  active_count: number;
  avg_referenced_count_per_insight: number;
} = { insights: [], active_count: 0, avg_referenced_count_per_insight: 0 };

vi.mock("@learnpro/db", () => ({
  listLatestInsights: vi.fn(async (_db: unknown, _userId: string, _limit: number) => {
    return mockState.insights;
  }),
  getInsightTelemetry: vi.fn(async () => ({
    active_count: mockState.active_count,
    avg_referenced_count_per_insight: mockState.avg_referenced_count_per_insight,
  })),
}));

import { registerProfileInsightsRoutes } from "./profile-insights.js";

beforeEach(() => {
  mockState.insights = [];
  mockState.active_count = 0;
  mockState.avg_referenced_count_per_insight = 0;
});

async function buildApp(opts: { authed: boolean }) {
  const app = Fastify({ logger: false });
  registerProfileInsightsRoutes(app, {
    db: {} as unknown as import("@learnpro/db").LearnProDb,
    sessionResolver: opts.authed
      ? async () => ({ user_id: "11111111-1111-4111-8111-111111111111", org_id: "self", email: "x@y" })
      : async () => null,
  });
  return app;
}

describe("registerProfileInsightsRoutes — STORY-033", () => {
  it("401 when the request is unauthenticated", async () => {
    const app = await buildApp({ authed: false });
    const res = await app.inject({ method: "GET", url: "/v1/profile-insights" });
    expect(res.statusCode).toBe(401);
  });

  it("returns a JSON envelope with insights + telemetry", async () => {
    mockState.insights = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        user_id: "u1",
        org_id: "self",
        insight_text: "user reaches for `for` when comprehensions would be cleaner",
        concept_tags: ["loops"],
        referenced_count: 2,
        created_at: new Date("2026-04-25T10:00:00Z"),
        expires_at: new Date("2026-05-25T10:00:00Z"),
      },
    ];
    mockState.active_count = 1;
    mockState.avg_referenced_count_per_insight = 2;
    const app = await buildApp({ authed: true });
    const res = await app.inject({ method: "GET", url: "/v1/profile-insights" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      insights: Array<{ id: string; text: string; concept_tags: string[]; referenced_count: number }>;
      active_count: number;
      avg_referenced_count_per_insight: number;
    };
    expect(body.insights).toHaveLength(1);
    expect(body.insights[0]?.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(body.insights[0]?.text).toContain("comprehensions");
    expect(body.insights[0]?.concept_tags).toEqual(["loops"]);
    expect(body.insights[0]?.referenced_count).toBe(2);
    expect(body.active_count).toBe(1);
    expect(body.avg_referenced_count_per_insight).toBe(2);
  });

  it("returns an empty list + zero telemetry when the user has no insights yet", async () => {
    const app = await buildApp({ authed: true });
    const res = await app.inject({ method: "GET", url: "/v1/profile-insights" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      insights: [],
      active_count: 0,
      avg_referenced_count_per_insight: 0,
    });
  });

  it("rejects an invalid limit query (non-numeric)", async () => {
    const app = await buildApp({ authed: true });
    const res = await app.inject({ method: "GET", url: "/v1/profile-insights?limit=abc" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-positive limit", async () => {
    const app = await buildApp({ authed: true });
    const res = await app.inject({ method: "GET", url: "/v1/profile-insights?limit=0" });
    expect(res.statusCode).toBe(400);
  });

  it("caps a too-high limit at 20 (no error)", async () => {
    const app = await buildApp({ authed: true });
    const res = await app.inject({ method: "GET", url: "/v1/profile-insights?limit=999" });
    expect(res.statusCode).toBe(200);
  });
});
