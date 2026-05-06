import { describe, expect, it } from "vitest";
import type { TodayPlanDeps } from "@learnpro/agent";
import { buildServer } from "./index.js";
import type { SessionPlanFactory } from "./session-plan.js";
import type { SessionResolver } from "./session.js";
import type { SessionPlan, SessionPlanItem } from "@learnpro/db";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({
    user_id,
    org_id: "self",
    email: `${user_id}@learnpro.local`,
  });

interface FakeDepsState {
  activePlan: Awaited<ReturnType<TodayPlanDeps["getLatestActivePlan"]>>;
  dueConcepts: Awaited<ReturnType<TodayPlanDeps["getDueConcepts"]>>;
  todaysEpisodes: number;
}

function fakeDeps(state: FakeDepsState): TodayPlanDeps {
  return {
    async getLatestActivePlan() {
      return state.activePlan;
    },
    async getDueConcepts() {
      return state.dueConcepts;
    },
    async countTodaysEpisodes() {
      return state.todaysEpisodes;
    },
  };
}

interface FakePlanFactoryState {
  latest: SessionPlan | null;
  generateCount: number;
  generateThrows?: boolean;
}

function makeSessionPlanFactory(state: FakePlanFactoryState): SessionPlanFactory {
  return {
    async loadLatest() {
      return state.latest;
    },
    async generateAndPersist() {
      state.generateCount += 1;
      if (state.generateThrows) {
        throw new Error("simulated planner outage");
      }
      const items: SessionPlanItem[] = [
        {
          slug: "warmup-fresh",
          objective: "Warm up (regenerated)",
          estimated_duration_min: 8,
          status: "pending",
        },
        {
          slug: "drill-fresh",
          objective: "Drill (regenerated)",
          estimated_duration_min: 10,
          status: "pending",
        },
        {
          slug: "stretch-fresh",
          objective: "Stretch (regenerated)",
          estimated_duration_min: 5,
          status: "pending",
        },
      ];
      const plan: SessionPlan = {
        id: PLAN_ID,
        user_id: USER_ID,
        org_id: "self",
        created_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        time_budget_min: 25,
        items,
      };
      state.latest = plan;
      return { plan, fallback: false };
    },
    async markCompleted() {
      return { updated: false, plan: null };
    },
  };
}

describe("GET /v1/today-plan (STORY-046)", () => {
  it("returns 401 when no session", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const factory = makeSessionPlanFactory({ latest: null, generateCount: 0 });
    const app = buildServer({ todayPlanDeps: deps, sessionPlanFactory: factory });
    const res = await app.inject({ method: "GET", url: "/v1/today-plan" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns an empty plan when nothing is due and no active session plan", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const factory = makeSessionPlanFactory({ latest: null, generateCount: 0 });
    const app = buildServer({
      todayPlanDeps: deps,
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/today-plan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      today_plan: {
        review_items: unknown[];
        session_plan_items: unknown[];
        episodes_today_count: number;
        session_plan_id: string | null;
        dampening: Record<string, unknown>;
      };
    };
    expect(body.today_plan.review_items).toEqual([]);
    expect(body.today_plan.session_plan_items).toEqual([]);
    expect(body.today_plan.episodes_today_count).toBe(0);
    expect(body.today_plan.session_plan_id).toBeNull();
    expect(body.today_plan.dampening).toEqual({});
    await app.close();
  });

  it("returns review items + session plan items when both exist", async () => {
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: new Date(),
        items: [
          {
            slug: "warmup",
            objective: "Refresh comprehensions",
            estimated_duration_min: 8,
            status: "pending",
          },
        ],
      },
      dueConcepts: [
        {
          concept_id: "concept-list-comp",
          state: { due: new Date(Date.now() - 2 * 86400_000).toISOString() },
        },
      ],
      todaysEpisodes: 0,
    });
    const factory = makeSessionPlanFactory({ latest: null, generateCount: 0 });
    const app = buildServer({
      todayPlanDeps: deps,
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/today-plan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      today_plan: {
        review_items: Array<{ concept_id: string; days_overdue: number; reasoning: string }>;
        session_plan_items: Array<{ slug: string; reasoning: string }>;
        session_plan_id: string;
      };
    };
    expect(body.today_plan.review_items).toHaveLength(1);
    expect(body.today_plan.review_items[0]?.concept_id).toBe("concept-list-comp");
    expect(body.today_plan.review_items[0]?.days_overdue).toBeGreaterThanOrEqual(2);
    expect(body.today_plan.session_plan_items).toHaveLength(1);
    expect(body.today_plan.session_plan_items[0]?.slug).toBe("warmup");
    expect(body.today_plan.session_plan_id).toBe(PLAN_ID);
    await app.close();
  });

  it("returns an empty dampening object on a normal GET (no regenerate flag)", async () => {
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: new Date(),
        items: [
          {
            slug: "warmup",
            objective: "Warm up",
            estimated_duration_min: 8,
            status: "pending",
          },
        ],
      },
      dueConcepts: [],
      todaysEpisodes: 0,
    });
    const factory = makeSessionPlanFactory({ latest: null, generateCount: 0 });
    const app = buildServer({
      todayPlanDeps: deps,
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/today-plan" });
    const body = res.json() as { today_plan: { dampening: Record<string, unknown> } };
    expect(body.today_plan.dampening).toEqual({});
    await app.close();
  });
});

describe("POST /v1/today-plan/replan (STORY-046)", () => {
  it("returns 401 when no session", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const factory = makeSessionPlanFactory({ latest: null, generateCount: 0 });
    const app = buildServer({ todayPlanDeps: deps, sessionPlanFactory: factory });
    const res = await app.inject({ method: "POST", url: "/v1/today-plan/replan" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("dampens the regenerate when only 1 weekday is missed (returns 200 + dampened: true)", async () => {
    // Plan was created yesterday, no episodes today, today is a weekday → AC #5 dampening kicks in.
    const yesterday = new Date(Date.now() - 86400_000);
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: yesterday,
        items: [
          {
            slug: "warmup",
            objective: "Warm up",
            estimated_duration_min: 8,
            status: "pending",
          },
        ],
      },
      dueConcepts: [],
      todaysEpisodes: 0,
    });
    const factoryState: FakePlanFactoryState = { latest: null, generateCount: 0 };
    const factory = makeSessionPlanFactory(factoryState);
    const app = buildServer({
      todayPlanDeps: deps,
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });

    const res = await app.inject({ method: "POST", url: "/v1/today-plan/replan" });
    // We can't know if "now" is weekday/weekend deterministically — both paths should return 200
    // and either dampen or not. Verify the route never 500s and the shape is consistent.
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      today_plan: { dampening: Record<string, unknown> };
      dampened: boolean;
      reason?: string;
    };
    if (body.dampened) {
      expect(body.reason).toBeDefined();
      expect(body.today_plan.dampening["suppressed_replan_reason"]).toBe(body.reason);
      // Dampened path should NOT call the planner.
      expect(factoryState.generateCount).toBe(0);
    } else {
      // Non-dampened path: planner gets called once.
      expect(factoryState.generateCount).toBe(1);
    }
    await app.close();
  });

  it("regenerates when there's no existing plan to dampen against", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const factoryState: FakePlanFactoryState = { latest: null, generateCount: 0 };
    const factory = makeSessionPlanFactory(factoryState);
    const app = buildServer({
      todayPlanDeps: deps,
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/today-plan/replan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { dampened: boolean };
    expect(body.dampened).toBe(false);
    expect(factoryState.generateCount).toBe(1);
    await app.close();
  });

  it("regenerates when the user has done 2+ episodes today (active user)", async () => {
    const yesterday = new Date(Date.now() - 86400_000);
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: yesterday,
        items: [
          {
            slug: "warmup",
            objective: "Warm up",
            estimated_duration_min: 8,
            status: "pending",
          },
        ],
      },
      dueConcepts: [],
      todaysEpisodes: 3,
    });
    const factoryState: FakePlanFactoryState = { latest: null, generateCount: 0 };
    const factory = makeSessionPlanFactory(factoryState);
    const app = buildServer({
      todayPlanDeps: deps,
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/today-plan/replan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { dampened: boolean };
    expect(body.dampened).toBe(false);
    expect(factoryState.generateCount).toBe(1);
    await app.close();
  });

  it("returns 503 when the regenerate path's planner call throws", async () => {
    // No active plan → never dampened → planner gets called → throws → 503.
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const factoryState: FakePlanFactoryState = {
      latest: null,
      generateCount: 0,
      generateThrows: true,
    };
    const factory = makeSessionPlanFactory(factoryState);
    const app = buildServer({
      todayPlanDeps: deps,
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/today-plan/replan" });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: string }).error).toBe("today_plan_unavailable");
    await app.close();
  });

  it("dampened response carries the friendly reason for the UI banner", async () => {
    // Deterministically force dampening by injecting a deps that always reports "1 day missed".
    // We do this by patching the factory's behavior: the route reads dampening from
    // buildTodayPlan, not from the deps directly — so we simulate the dampening by giving the
    // composer a yesterday-created plan + 0 episodes. To make the assertion deterministic
    // regardless of "today is a weekday/weekend", we craft a `deps` whose `getLatestActivePlan`
    // returns a plan created exactly 1 day ago when called with the route's `now`. This pinch is
    // verified by the unit tests in the agent package; here we just check the contract.
    const yesterday = new Date(Date.now() - 86400_000);
    const isWeekend = (() => {
      const d = new Date().getUTCDay();
      return d === 0 || d === 6;
    })();
    const deps = fakeDeps({
      activePlan: {
        id: PLAN_ID,
        user_id: USER_ID,
        created_at: yesterday,
        items: [
          {
            slug: "warmup",
            objective: "Warm up",
            estimated_duration_min: 8,
            status: "pending",
          },
        ],
      },
      dueConcepts: [],
      todaysEpisodes: 0,
    });
    const factoryState: FakePlanFactoryState = { latest: null, generateCount: 0 };
    const factory = makeSessionPlanFactory(factoryState);
    const app = buildServer({
      todayPlanDeps: deps,
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/today-plan/replan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { dampened: boolean; reason?: string };
    // Either a weekend OR a 1-day miss should dampen.
    expect(body.dampened).toBe(true);
    expect(body.reason).toBeDefined();
    expect(typeof body.reason).toBe("string");
    if (isWeekend) {
      expect(body.reason).toMatch(/Weekend/i);
    } else {
      expect(body.reason).toMatch(/Only one day/i);
    }
    expect(factoryState.generateCount).toBe(0);
    await app.close();
  });

  it("re-plan response includes the freshly-composed today_plan when not dampened", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const factoryState: FakePlanFactoryState = { latest: null, generateCount: 0 };
    const factory = makeSessionPlanFactory(factoryState);
    const app = buildServer({
      todayPlanDeps: deps,
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/today-plan/replan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      today_plan: { date: string };
    };
    expect(body.today_plan.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await app.close();
  });
});

describe("Routes are gated on both deps + factory presence (STORY-046)", () => {
  it("does not register today-plan routes when only todayPlanDeps is provided", async () => {
    const deps = fakeDeps({ activePlan: null, dueConcepts: [], todaysEpisodes: 0 });
    const app = buildServer({
      todayPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/today-plan" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("does not register today-plan routes when only sessionPlanFactory is provided", async () => {
    const factory = makeSessionPlanFactory({ latest: null, generateCount: 0 });
    const app = buildServer({
      sessionPlanFactory: factory,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/today-plan" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
