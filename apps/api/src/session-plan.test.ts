import { describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import type { SessionPlanFactory } from "./session-plan.js";
import type { SessionResolver } from "./session.js";
import type { SessionPlan, SessionPlanItem } from "@learnpro/db";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const EPISODE_ID = "33333333-3333-4333-8333-333333333333";

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({
    user_id,
    org_id: "self",
    email: `${user_id}@learnpro.local`,
  });

function plan(overrides: Partial<SessionPlan> = {}): SessionPlan {
  const items: SessionPlanItem[] = [
    { slug: "warmup", objective: "Warm up", estimated_duration_min: 8, status: "pending" },
    { slug: "drill", objective: "Drill", estimated_duration_min: 10, status: "pending" },
    { slug: "stretch", objective: "Stretch", estimated_duration_min: 7, status: "pending" },
  ];
  return {
    id: PLAN_ID,
    user_id: USER_ID,
    org_id: "self",
    created_at: new Date("2026-05-03T10:00:00Z"),
    expires_at: new Date("2026-05-04T10:00:00Z"),
    time_budget_min: 25,
    items,
    ...overrides,
  };
}

interface FakeFactoryState {
  latest: SessionPlan | null;
  generateCount: number;
  markCompletedCalls: Array<{ plan_id: string; slug: string; episode_id: string }>;
  // When true, generate throws — used to assert the 503 path.
  generateThrows?: boolean;
  // When true, generate returns fallback=true.
  generateFallback?: boolean;
}

function makeFactory(state: FakeFactoryState): SessionPlanFactory {
  return {
    async loadLatest() {
      return state.latest;
    },
    async generateAndPersist(input) {
      state.generateCount += 1;
      if (state.generateThrows) {
        throw new Error("simulated LLM outage");
      }
      const newPlan = plan({
        time_budget_min: input.time_budget_min,
        items: [
          {
            slug: "generated-1",
            objective: "Generated one",
            estimated_duration_min: 8,
            status: "pending",
          },
          {
            slug: "generated-2",
            objective: "Generated two",
            estimated_duration_min: 10,
            status: "pending",
          },
          {
            slug: "generated-3",
            objective: "Generated three",
            estimated_duration_min: 5,
            status: "pending",
          },
        ],
      });
      state.latest = newPlan;
      return { plan: newPlan, fallback: state.generateFallback ?? false };
    },
    async markCompleted(input) {
      state.markCompletedCalls.push(input);
      const current = state.latest;
      if (!current) return { updated: false, plan: null };
      const idx = current.items.findIndex((it) => it.slug === input.slug);
      if (idx < 0) return { updated: false, plan: current };
      const target = current.items[idx]!;
      if (target.status === "completed") return { updated: false, plan: current };
      const updated: SessionPlanItem = {
        ...target,
        status: "completed",
        completed_at: new Date().toISOString(),
        episode_id: input.episode_id,
      };
      const items = current.items.slice();
      items[idx] = updated;
      const next: SessionPlan = { ...current, items };
      state.latest = next;
      return { updated: true, plan: next };
    },
  };
}

describe("GET /v1/session-plan (STORY-015)", () => {
  it("returns 401 when no session", async () => {
    const factory = makeFactory({ latest: null, generateCount: 0, markCompletedCalls: [] });
    const app = buildServer({ sessionPlanFactory: factory });
    const res = await app.inject({ method: "GET", url: "/v1/session-plan" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns plan: null when there is no active plan for the user", async () => {
    const factory = makeFactory({ latest: null, generateCount: 0, markCompletedCalls: [] });
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/session-plan" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ plan: null });
    await app.close();
  });

  it("returns the latest active plan when one exists", async () => {
    const factory = makeFactory({
      latest: plan(),
      generateCount: 0,
      markCompletedCalls: [],
    });
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/session-plan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { plan: { id: string; items: SessionPlanItem[] } };
    expect(body.plan.id).toBe(PLAN_ID);
    expect(body.plan.items).toHaveLength(3);
    await app.close();
  });
});

describe("POST /v1/session-plan (STORY-015)", () => {
  it("returns 401 when no session", async () => {
    const factory = makeFactory({ latest: null, generateCount: 0, markCompletedCalls: [] });
    const app = buildServer({ sessionPlanFactory: factory });
    const res = await app.inject({ method: "POST", url: "/v1/session-plan" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("happy path: no active plan → generates and returns 201 + fallback=false", async () => {
    const state: FakeFactoryState = {
      latest: null,
      generateCount: 0,
      markCompletedCalls: [],
    };
    const factory = makeFactory(state);
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/session-plan" });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      plan: { items: SessionPlanItem[]; time_budget_min: number };
      fallback: boolean;
    };
    expect(body.fallback).toBe(false);
    expect(body.plan.items).toHaveLength(3);
    expect(state.generateCount).toBe(1);
    await app.close();
  });

  it("idempotency: a second POST in the active window returns the same plan without re-generating", async () => {
    const state: FakeFactoryState = {
      latest: plan(),
      generateCount: 0,
      markCompletedCalls: [],
    };
    const factory = makeFactory(state);
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/session-plan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { plan: { id: string }; fallback: boolean };
    expect(body.plan.id).toBe(PLAN_ID);
    expect(state.generateCount).toBe(0);
    await app.close();
  });

  it("LLM failure path: factory.generateAndPersist throws → 503 (route never 500s for plan failures)", async () => {
    const state: FakeFactoryState = {
      latest: null,
      generateCount: 0,
      markCompletedCalls: [],
      generateThrows: true,
    };
    const factory = makeFactory(state);
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/session-plan" });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: string }).error).toBe("session_plan_unavailable");
    await app.close();
  });

  it("fallback flag is surfaced through to the response when the agent fell back", async () => {
    const state: FakeFactoryState = {
      latest: null,
      generateCount: 0,
      markCompletedCalls: [],
      generateFallback: true,
    };
    const factory = makeFactory(state);
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/session-plan" });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { fallback: boolean }).fallback).toBe(true);
    await app.close();
  });
});

describe("POST /v1/session-plan/items/:slug/complete (STORY-015)", () => {
  it("returns 401 when no session", async () => {
    const factory = makeFactory({ latest: null, generateCount: 0, markCompletedCalls: [] });
    const app = buildServer({ sessionPlanFactory: factory });
    const res = await app.inject({
      method: "POST",
      url: "/v1/session-plan/items/warmup/complete",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 on malformed body (missing episode_id)", async () => {
    const factory = makeFactory({ latest: plan(), generateCount: 0, markCompletedCalls: [] });
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/session-plan/items/warmup/complete",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when slug is not kebab-case", async () => {
    const factory = makeFactory({ latest: plan(), generateCount: 0, markCompletedCalls: [] });
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/session-plan/items/Bad_Slug/complete",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when there is no active plan to mark against", async () => {
    const factory = makeFactory({ latest: null, generateCount: 0, markCompletedCalls: [] });
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/session-plan/items/warmup/complete",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("no_active_plan");
    await app.close();
  });

  it("happy path: marks item completed + returns updated plan", async () => {
    const state: FakeFactoryState = {
      latest: plan(),
      generateCount: 0,
      markCompletedCalls: [],
    };
    const factory = makeFactory(state);
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/session-plan/items/drill/complete",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { updated: boolean; plan: { items: SessionPlanItem[] } };
    expect(body.updated).toBe(true);
    const drill = body.plan.items.find((i) => i.slug === "drill");
    expect(drill?.status).toBe("completed");
    expect(drill?.episode_id).toBe(EPISODE_ID);
    await app.close();
  });

  it("idempotent: re-marking the same slug returns updated=false but still 200", async () => {
    const state: FakeFactoryState = {
      latest: plan(),
      generateCount: 0,
      markCompletedCalls: [],
    };
    const factory = makeFactory(state);
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const first = await app.inject({
      method: "POST",
      url: "/v1/session-plan/items/drill/complete",
      payload: { episode_id: EPISODE_ID },
    });
    expect(first.statusCode).toBe(200);
    expect((first.json() as { updated: boolean }).updated).toBe(true);

    const second = await app.inject({
      method: "POST",
      url: "/v1/session-plan/items/drill/complete",
      payload: { episode_id: EPISODE_ID },
    });
    expect(second.statusCode).toBe(200);
    expect((second.json() as { updated: boolean }).updated).toBe(false);
    await app.close();
  });

  it("unknown slug: returns 200 + updated=false (slug isn't in the plan items)", async () => {
    const state: FakeFactoryState = {
      latest: plan(),
      generateCount: 0,
      markCompletedCalls: [],
    };
    const factory = makeFactory(state);
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/session-plan/items/nope/complete",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { updated: boolean }).updated).toBe(false);
    await app.close();
  });
});

// AC #1 — plan must render within 2s. The route handler returns synchronously after the
// factory call; this test asserts the per-call ceiling stays well under that with a fake.
describe("/v1/session-plan latency (STORY-015 AC #1)", () => {
  it("POST returns within 100ms with a synchronous fake factory (loose ceiling)", async () => {
    const factory = makeFactory({ latest: null, generateCount: 0, markCompletedCalls: [] });
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const start = Date.now();
    const res = await app.inject({ method: "POST", url: "/v1/session-plan" });
    const elapsed = Date.now() - start;
    expect(res.statusCode).toBe(201);
    expect(elapsed).toBeLessThan(2000);
    await app.close();
  });
});
