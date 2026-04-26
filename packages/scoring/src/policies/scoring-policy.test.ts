import { describe, expect, it } from "vitest";
import { RuleBasedScoringPolicy, DEFAULT_SCORING_RULES } from "./scoring-policy.js";
import { InMemoryPolicyTelemetrySink } from "./telemetry.js";
import type { EpisodeSummary, LearnerProfile } from "./types.js";

const profile: LearnerProfile = {
  user_id: "u1",
  concept_skills: [],
  recent_engagement: 0.5,
  agreement_rate: 0.5,
  episodes_count: 10,
};

function episode(overrides: Partial<EpisodeSummary> = {}): EpisodeSummary {
  return {
    episode_id: "e1",
    user_id: "u1",
    problem_id: "p1",
    concept_ids: ["list-comp"],
    difficulty: "medium",
    passed: true,
    hints_used: 0,
    submit_count: 1,
    reveal_clicked: false,
    time_to_solve_ms: 60_000,
    ...overrides,
  };
}

describe("RuleBasedScoringPolicy", () => {
  it("scores a clean medium pass at 10*1.5*1 = 15 xp with first_try_no_hints signal", () => {
    const policy = new RuleBasedScoringPolicy();
    const result = policy.score({ episode: episode(), profile });
    expect(result.xp).toBe(15);
    expect(result.signals).toContain("first_try_no_hints");
    expect(result.mastery_delta).toBeGreaterThan(0);
  });

  it("halves a multi-submit pass and emits multiple_submits signal", () => {
    const policy = new RuleBasedScoringPolicy();
    const result = policy.score({
      episode: episode({ submit_count: 3 }),
      profile,
    });
    expect(result.xp).toBe(Math.round(10 * 1.5 * 0.5));
    expect(result.signals).toContain("multiple_submits");
  });

  it("zeros xp on reveal_clicked and gives negative mastery on fail", () => {
    const policy = new RuleBasedScoringPolicy();
    const reveal = policy.score({
      episode: episode({ passed: true, reveal_clicked: true }),
      profile,
    });
    expect(reveal.xp).toBe(0);
    expect(reveal.signals).toContain("reveal_clicked");

    const fail = policy.score({ episode: episode({ passed: false }), profile });
    expect(fail.xp).toBe(0);
    expect(fail.mastery_delta).toBeLessThan(0);
    expect(fail.signals).toContain("not_passed");
  });

  it("honors operator-injected rule overrides (base_xp doubled)", () => {
    const policy = new RuleBasedScoringPolicy({ ...DEFAULT_SCORING_RULES, base_xp: 20 });
    const result = policy.score({ episode: episode(), profile });
    expect(result.xp).toBe(30);
  });

  it("emits a telemetry event on every decision", () => {
    const sink = new InMemoryPolicyTelemetrySink();
    const policy = new RuleBasedScoringPolicy(DEFAULT_SCORING_RULES, sink);
    policy.score({ episode: episode(), profile });
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.policy).toBe("scoring");
    expect(sink.events[0]?.implementation).toBe("rule-based-scoring");
  });

  it("throws on an unknown difficulty tier configured in rules", () => {
    const broken = { ...DEFAULT_SCORING_RULES, difficulty_factors: { easy: 1.0 } };
    const policy = new RuleBasedScoringPolicy(broken);
    expect(() => policy.score({ episode: episode({ difficulty: "expert" }), profile })).toThrow(
      /No difficulty factor/,
    );
  });
});
