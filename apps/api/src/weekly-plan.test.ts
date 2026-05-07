import { describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";
import type { WeeklyPlanDeps } from "./weekly-plan.js";
import type {
  WeeklyPlanConceptGraph,
  WeeklyPlanDueReview,
  WeeklyPlanRecentEpisode,
} from "@learnpro/agent";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TRACK_SLUG = "python-fundamentals";

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({
    user_id,
    org_id: "self",
    email: `${user_id}@learnpro.local`,
  });

interface FakeWeeklyDepsState {
  activeTrackSlug: string | null;
  conceptGraph: WeeklyPlanConceptGraph;
  recentEpisodes: WeeklyPlanRecentEpisode[];
  dueReviews: WeeklyPlanDueReview[];
  targetRole: string | null;
  previousMarkerAt: Date | null;
  todaysEpisodes: number;
}

function fakeWeeklyDeps(state: FakeWeeklyDepsState): WeeklyPlanDeps {
  return {
    async getActiveTrackSlug() {
      return state.activeTrackSlug;
    },
    async getConceptGraph() {
      return state.conceptGraph;
    },
    async getRecentEpisodes() {
      return state.recentEpisodes;
    },
    async getDueReviews() {
      return state.dueReviews;
    },
    async getTargetRole() {
      return state.targetRole;
    },
    async getPreviousMarkerAt() {
      return state.previousMarkerAt;
    },
    async countTodaysEpisodes() {
      return state.todaysEpisodes;
    },
  };
}

function makeBaseState(overrides: Partial<FakeWeeklyDepsState> = {}): FakeWeeklyDepsState {
  return {
    activeTrackSlug: TRACK_SLUG,
    conceptGraph: {
      concepts: [
        {
          slug: "python.basics.variables",
          name: "Variables",
          track_slugs: ["python-fundamentals"],
          tags: ["fundamentals"],
        },
        {
          slug: "python.basics.lists",
          name: "Lists",
          track_slugs: ["python-fundamentals"],
          tags: ["fundamentals"],
        },
        {
          slug: "python.basics.for-loops",
          name: "For loops",
          track_slugs: ["python-fundamentals"],
          tags: ["fundamentals"],
        },
        {
          slug: "python.basics.list-comprehensions",
          name: "List comprehensions",
          track_slugs: ["python-fundamentals"],
          tags: ["fundamentals"],
        },
      ],
      edges: [
        { from: "python.basics.lists", to: "python.basics.variables" },
        { from: "python.basics.for-loops", to: "python.basics.lists" },
        { from: "python.basics.list-comprehensions", to: "python.basics.for-loops" },
      ],
    },
    recentEpisodes: [],
    dueReviews: [],
    targetRole: null,
    previousMarkerAt: null,
    todaysEpisodes: 0,
    ...overrides,
  };
}

describe("GET /v1/weekly-plan (STORY-046b)", () => {
  it("returns 401 when no session", async () => {
    const deps = fakeWeeklyDeps(makeBaseState());
    const app = buildServer({ weeklyPlanDeps: deps });
    const res = await app.inject({ method: "GET", url: "/v1/weekly-plan" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 503 when the user has no active track and no track_slug query is supplied", async () => {
    const deps = fakeWeeklyDeps(makeBaseState({ activeTrackSlug: null }));
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/weekly-plan" });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: string }).error).toBe("weekly_plan_unavailable");
    await app.close();
  });

  it("returns 503 when the concept graph is empty for the requested track", async () => {
    const deps = fakeWeeklyDeps(
      makeBaseState({
        conceptGraph: { concepts: [], edges: [] },
      }),
    );
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/weekly-plan" });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { error: string }).error).toBe("weekly_plan_unavailable");
    await app.close();
  });

  it("returns the composed weekly plan when the graph is populated", async () => {
    const deps = fakeWeeklyDeps(makeBaseState());
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/weekly-plan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      weekly_plan: {
        theme: string;
        theme_concept_slug: string;
        daily_concepts: Array<{ day_index: number; concept_slug: string; reasoning: string }>;
        theme_concepts: string[];
        due_reviews_count: number;
      };
      track_slug: string;
    };
    expect(body.track_slug).toBe(TRACK_SLUG);
    expect(body.weekly_plan.theme).toContain("Variables");
    expect(body.weekly_plan.theme_concept_slug).toBe("python.basics.variables");
    expect(body.weekly_plan.daily_concepts).toHaveLength(7);
    expect(body.weekly_plan.theme_concepts.length).toBeGreaterThan(0);
    await app.close();
  });

  it("uses the track_slug query parameter when provided (overriding the active track)", async () => {
    const deps = fakeWeeklyDeps(makeBaseState({ activeTrackSlug: "other-track" }));
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "GET",
      url: `/v1/weekly-plan?track_slug=${encodeURIComponent(TRACK_SLUG)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { track_slug: string };
    expect(body.track_slug).toBe(TRACK_SLUG);
    await app.close();
  });

  it("propagates due_reviews_count from the deps", async () => {
    const deps = fakeWeeklyDeps(
      makeBaseState({
        dueReviews: [
          { concept_slug: "python.basics.variables" },
          { concept_slug: "python.basics.lists" },
        ],
      }),
    );
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/weekly-plan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { weekly_plan: { due_reviews_count: number } };
    expect(body.weekly_plan.due_reviews_count).toBe(2);
    await app.close();
  });

  it("does NOT set dampening on a normal GET", async () => {
    const deps = fakeWeeklyDeps(
      makeBaseState({
        previousMarkerAt: new Date(Date.now() - 86400_000),
      }),
    );
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/weekly-plan" });
    const body = res.json() as {
      weekly_plan: { dampening: { suppressed_replan_reason?: string } };
    };
    expect(body.weekly_plan.dampening.suppressed_replan_reason).toBeUndefined();
    await app.close();
  });
});

describe("POST /v1/weekly-plan/replan (STORY-046b)", () => {
  it("returns 401 when no session", async () => {
    const deps = fakeWeeklyDeps(makeBaseState());
    const app = buildServer({ weeklyPlanDeps: deps });
    const res = await app.inject({ method: "POST", url: "/v1/weekly-plan/replan" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 503 when no active track is available", async () => {
    const deps = fakeWeeklyDeps(makeBaseState({ activeTrackSlug: null }));
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/weekly-plan/replan" });
    expect(res.statusCode).toBe(503);
    await app.close();
  });

  it("returns the regenerated plan with dampened: false when nothing dampens", async () => {
    const deps = fakeWeeklyDeps(makeBaseState());
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/weekly-plan/replan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      weekly_plan: { theme_concept_slug: string };
      dampened: boolean;
      track_slug: string;
    };
    expect(body.dampened).toBe(false);
    expect(body.weekly_plan.theme_concept_slug).toBe("python.basics.variables");
    expect(body.track_slug).toBe(TRACK_SLUG);
    await app.close();
  });

  it("returns dampened: true with a friendly reason when a 1-day-miss + weekday + 0 episodes", async () => {
    // Yesterday-created previous marker + 0 episodes today → dampened either as 1-day-miss
    // (weekday) or as weekend (Sat/Sun). Either path returns dampened=true with a non-empty reason.
    const yesterday = new Date(Date.now() - 86400_000);
    const deps = fakeWeeklyDeps(
      makeBaseState({
        previousMarkerAt: yesterday,
        todaysEpisodes: 0,
      }),
    );
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/weekly-plan/replan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      dampened: boolean;
      reason?: string;
      weekly_plan: { dampening: { suppressed_replan_reason?: string } };
    };
    expect(body.dampened).toBe(true);
    expect(body.reason).toBeDefined();
    expect(typeof body.reason).toBe("string");
    expect(body.weekly_plan.dampening.suppressed_replan_reason).toBe(body.reason);
    await app.close();
  });

  it("regenerates when the user is active today (todaysEpisodes > 0)", async () => {
    const deps = fakeWeeklyDeps(
      makeBaseState({
        previousMarkerAt: new Date(Date.now() - 86400_000),
        todaysEpisodes: 3,
      }),
    );
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/weekly-plan/replan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { dampened: boolean };
    expect(body.dampened).toBe(false);
    await app.close();
  });

  it("uses the track_slug query parameter when supplied", async () => {
    const deps = fakeWeeklyDeps(makeBaseState({ activeTrackSlug: "ignored-track" }));
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/weekly-plan/replan?track_slug=${encodeURIComponent(TRACK_SLUG)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { track_slug: string };
    expect(body.track_slug).toBe(TRACK_SLUG);
    await app.close();
  });
});

describe("Routes are gated on weeklyPlanDeps presence (STORY-046b)", () => {
  it("does not register the GET route when no weeklyPlanDeps are provided", async () => {
    const app = buildServer({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/weekly-plan" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("does not register the POST route when no weeklyPlanDeps are provided", async () => {
    const app = buildServer({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "POST", url: "/v1/weekly-plan/replan" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
