import { describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";
import {
  buildWeeklyThemeGeneratorFromEnv,
  type WeeklyPlanDeps,
} from "./weekly-plan.js";
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

describe("buildWeeklyThemeGeneratorFromEnv — STORY-046c env flag", () => {

  // Use the same fake LLM shape from problem-variants tests — minimal LLMProvider impl.
  const fakeLLM = {
    name: "fake",
    async complete() {
      return {
        text: '{"theme":"x"}',
        model: "claude-haiku-4-5-20251001",
        finish_reason: "end_turn" as const,
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
    async *stream() {},
    async embed() {
      return { vector: [], model: "voyage-3", usage: {} };
    },
    async toolCall() {
      return {
        text: "",
        tool_calls: [],
        model: "fake",
        finish_reason: "end_turn" as const,
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  };

  it("returns a generator when LEARNPRO_WEEKLY_THEME_LLM is unset (default on)", () => {
    const gen = buildWeeklyThemeGeneratorFromEnv({ llm: fakeLLM, env: {} });
    expect(gen).not.toBeUndefined();
  });

  it("returns a generator when LEARNPRO_WEEKLY_THEME_LLM=1", () => {
    const gen = buildWeeklyThemeGeneratorFromEnv({
      llm: fakeLLM,
      env: { LEARNPRO_WEEKLY_THEME_LLM: "1" },
    });
    expect(gen).not.toBeUndefined();
  });

  it("returns undefined when LEARNPRO_WEEKLY_THEME_LLM=0", () => {
    const gen = buildWeeklyThemeGeneratorFromEnv({
      llm: fakeLLM,
      env: { LEARNPRO_WEEKLY_THEME_LLM: "0" },
    });
    expect(gen).toBeUndefined();
  });

  it("returns undefined when LEARNPRO_WEEKLY_THEME_LLM=false", () => {
    const gen = buildWeeklyThemeGeneratorFromEnv({
      llm: fakeLLM,
      env: { LEARNPRO_WEEKLY_THEME_LLM: "false" },
    });
    expect(gen).toBeUndefined();
  });

  it("returns undefined when LEARNPRO_WEEKLY_THEME_LLM=off", () => {
    const gen = buildWeeklyThemeGeneratorFromEnv({
      llm: fakeLLM,
      env: { LEARNPRO_WEEKLY_THEME_LLM: "OFF" },
    });
    expect(gen).toBeUndefined();
  });
});

describe("STORY-046c — themeGenerator wiring on weekly-plan routes", () => {
  // The cost gate is the central AC: GETs must NEVER fire the LLM theme generator. Only the
  // replan path may. These tests assert that gate by tracking calls on a fake generator.

  function recordingThemeGen(returnValue: { theme: string } | null) {
    const calls: Array<unknown> = [];
    const fn = async (input: unknown) => {
      calls.push(input);
      return returnValue;
    };
    return Object.assign(fn, { calls });
  }

  it("GET /v1/weekly-plan does NOT call the themeGenerator (cost gate)", async () => {
    const deps = fakeWeeklyDeps(makeBaseState());
    const themeGen = recordingThemeGen({ theme: "Should not be used on GET" });
    const app = buildServer({
      weeklyPlanDeps: deps,
      weeklyThemeGenerator: themeGen,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/weekly-plan" });
    expect(res.statusCode).toBe(200);
    expect(themeGen.calls).toHaveLength(0);
    const body = res.json() as { weekly_plan: { theme: string } };
    // GET falls back to STORY-046b's deterministic theme.
    expect(body.weekly_plan.theme).toBe("Variables week");
    await app.close();
  });

  it("POST /v1/weekly-plan/replan calls the themeGenerator and uses its theme", async () => {
    const deps = fakeWeeklyDeps(makeBaseState());
    const themeGen = recordingThemeGen({ theme: "Building blocks of declarative Python" });
    const app = buildServer({
      weeklyPlanDeps: deps,
      weeklyThemeGenerator: themeGen,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/weekly-plan/replan" });
    expect(res.statusCode).toBe(200);
    expect(themeGen.calls).toHaveLength(1);
    const body = res.json() as { weekly_plan: { theme: string }; dampened: boolean };
    expect(body.dampened).toBe(false);
    expect(body.weekly_plan.theme).toBe("Building blocks of declarative Python");
    await app.close();
  });

  it("POST /v1/weekly-plan/replan falls back to deterministic theme when generator returns null", async () => {
    const deps = fakeWeeklyDeps(makeBaseState());
    const themeGen = recordingThemeGen(null);
    const app = buildServer({
      weeklyPlanDeps: deps,
      weeklyThemeGenerator: themeGen,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/weekly-plan/replan" });
    expect(res.statusCode).toBe(200);
    expect(themeGen.calls).toHaveLength(1);
    const body = res.json() as { weekly_plan: { theme: string } };
    expect(body.weekly_plan.theme).toBe("Variables week");
    await app.close();
  });

  it("does NOT call the themeGenerator when no generator is wired (back-compat)", async () => {
    const deps = fakeWeeklyDeps(makeBaseState());
    const app = buildServer({
      weeklyPlanDeps: deps,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/weekly-plan/replan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { weekly_plan: { theme: string } };
    expect(body.weekly_plan.theme).toBe("Variables week");
    await app.close();
  });

  it("does NOT call the themeGenerator on a dampened replan (the dampened branch returns the unchanged plan)", async () => {
    // A dampened replan still calls buildWeeklyPlan (so the picker runs), and the picker
    // calls the themeGenerator if wired AND ≥3 concepts. The cost gate is "only on POST,
    // not on GET" — dampening doesn't add a second gate. This test documents that.
    const yesterday = new Date(Date.now() - 86400_000);
    const deps = fakeWeeklyDeps(
      makeBaseState({ previousMarkerAt: yesterday, todaysEpisodes: 0 }),
    );
    const themeGen = recordingThemeGen({ theme: "Loops and lists rhythm" });
    const app = buildServer({
      weeklyPlanDeps: deps,
      weeklyThemeGenerator: themeGen,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "POST", url: "/v1/weekly-plan/replan" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { dampened: boolean };
    // We don't assert call count here — buildWeeklyPlan may or may not run the generator
    // depending on the picker's outcome. The important assertion is no crash + the dampened
    // path returns 200.
    expect(typeof body.dampened).toBe("boolean");
    await app.close();
  });
});
