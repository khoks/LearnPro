import { describe, expect, it } from "vitest";
import { EloEwmaPolicy, DEFAULT_DIFFICULTY_RULES } from "./difficulty-policy.js";
import { InMemoryPolicyTelemetrySink } from "./telemetry.js";
import type { EpisodeSummary, LearnerProfile, ProblemRef } from "./types.js";

const targetConcepts = ["list-comp"];

const catalog: ProblemRef[] = [
  { problem_id: "p-easy-1", concept_ids: ["list-comp"], difficulty: "easy" },
  { problem_id: "p-medium-1", concept_ids: ["list-comp"], difficulty: "medium" },
  { problem_id: "p-medium-2", concept_ids: ["list-comp"], difficulty: "medium" },
  { problem_id: "p-hard-1", concept_ids: ["list-comp"], difficulty: "hard" },
  { problem_id: "p-noise", concept_ids: ["dict-comp"], difficulty: "easy" },
];

function profile(overrides: Partial<LearnerProfile> = {}): LearnerProfile {
  return {
    user_id: "u1",
    concept_skills: [],
    recent_engagement: 0.5,
    agreement_rate: 0.5,
    episodes_count: 0,
    ...overrides,
  };
}

function episode(overrides: Partial<EpisodeSummary> = {}): EpisodeSummary {
  return {
    episode_id: "e",
    user_id: "u1",
    problem_id: "p",
    concept_ids: targetConcepts,
    difficulty: "medium",
    passed: true,
    hints_used: 0,
    submit_count: 1,
    reveal_clicked: false,
    time_to_solve_ms: 60_000,
    ...overrides,
  };
}

describe("EloEwmaPolicy", () => {
  it("cold-starts to easy when there is no relevant history and no skill data", () => {
    const policy = new EloEwmaPolicy();
    const result = policy.recommend({
      profile: profile(),
      recent_episodes: [],
      catalog,
      target_concept_ids: targetConcepts,
    });
    expect(result.recommended_difficulty).toBe("easy");
    expect(result.top_problems).toContain("p-easy-1");
    expect(result.top_problems).not.toContain("p-noise");
  });

  it("steps difficulty up when ewma success is high", () => {
    const policy = new EloEwmaPolicy();
    const easyWins = Array.from({ length: 5 }, () => episode({ difficulty: "easy" }));
    const result = policy.recommend({
      profile: profile(),
      recent_episodes: easyWins,
      catalog,
      target_concept_ids: targetConcepts,
    });
    expect(result.recommended_difficulty).toBe("medium");
  });

  it("steps difficulty down when ewma success is low", () => {
    const policy = new EloEwmaPolicy();
    const failedHards = Array.from({ length: 5 }, () =>
      episode({ difficulty: "hard", passed: false }),
    );
    const result = policy.recommend({
      profile: profile(),
      recent_episodes: failedHards,
      catalog,
      target_concept_ids: targetConcepts,
    });
    expect(result.recommended_difficulty).toBe("medium");
  });

  it("respects an operator-injected stricter step_up_threshold (no step up on partial-success history)", () => {
    const policy = new EloEwmaPolicy({
      ...DEFAULT_DIFFICULTY_RULES,
      step_up_threshold: 0.6,
    });
    // hints_used → success_score = 0.5 → ewma converges to 0.5, below the raised threshold (0.6)
    const partial = Array.from({ length: 5 }, () => episode({ difficulty: "easy", hints_used: 1 }));
    const result = policy.recommend({
      profile: profile(),
      recent_episodes: partial,
      catalog,
      target_concept_ids: targetConcepts,
    });
    expect(result.recommended_difficulty).toBe("easy");
  });

  it("emits a telemetry event for every decision", () => {
    const sink = new InMemoryPolicyTelemetrySink();
    const policy = new EloEwmaPolicy(DEFAULT_DIFFICULTY_RULES, sink);
    policy.recommend({
      profile: profile(),
      recent_episodes: [],
      catalog,
      target_concept_ids: targetConcepts,
    });
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.policy).toBe("difficulty");
  });
});
