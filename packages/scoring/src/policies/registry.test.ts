import { describe, expect, it } from "vitest";
import { buildPolicyRegistry, loadPolicyConfigFromEnv } from "./registry.js";
import { InMemoryPolicyTelemetrySink } from "./telemetry.js";
import type { LearnerProfile } from "./types.js";

const profile: LearnerProfile = {
  user_id: "u1",
  concept_skills: [],
  recent_engagement: 0.5,
  agreement_rate: 0.5,
  episodes_count: 0,
};

describe("buildPolicyRegistry", () => {
  it("wires all four defaults when no config or telemetry is supplied", () => {
    const reg = buildPolicyRegistry({});
    expect(reg.scoring.name).toBe("rule-based-scoring");
    expect(reg.tone.name).toBe("warm-coach-constant");
    expect(reg.difficulty.name).toBe("elo-ewma");
    expect(reg.autonomy.name).toBe("always-confirm");
  });

  it("shares a telemetry sink across all four policies", () => {
    const sink = new InMemoryPolicyTelemetrySink();
    const reg = buildPolicyRegistry({ telemetry: sink });

    reg.tone.decide({ profile, context: {} });
    reg.autonomy.decide({ profile, consequence: "trivial" });

    expect(sink.events.map((e) => e.policy)).toEqual(["tone", "autonomy"]);
  });

  it("applies operator-injected rule overrides via PolicyConfig.scoring.rules", () => {
    const reg = buildPolicyRegistry({
      config: loadPolicyConfigFromEnv({
        LEARNPRO_POLICY_CONFIG: JSON.stringify({
          scoring: {
            implementation: "rule-based-scoring",
            rules: {
              base_xp: 100,
              difficulty_factors: { easy: 1, medium: 1, hard: 1, expert: 1 },
              first_try_no_hints_multiplier: 1,
              hints_used_multiplier: 0.5,
              multiple_submits_multiplier: 0.25,
              reveal_clicked_multiplier: 0,
              mastery_delta_per_pass: 0.1,
              mastery_delta_per_fail: -0.05,
            },
          },
        }),
      }),
    });

    const result = reg.scoring.score({
      episode: {
        episode_id: "e",
        user_id: "u1",
        problem_id: "p",
        concept_ids: [],
        difficulty: "expert",
        passed: true,
        hints_used: 0,
        submit_count: 1,
        reveal_clicked: false,
        time_to_solve_ms: 0,
      },
      profile,
    });
    expect(result.xp).toBe(100);
  });
});

describe("loadPolicyConfigFromEnv", () => {
  it("returns defaults when env var is unset", () => {
    const config = loadPolicyConfigFromEnv({});
    expect(config.scoring.implementation).toBe("rule-based-scoring");
    expect(config.tone.implementation).toBe("warm-coach-constant");
  });

  it("throws a clear error on malformed JSON", () => {
    expect(() => loadPolicyConfigFromEnv({ LEARNPRO_POLICY_CONFIG: "{not json" })).toThrow(
      /not valid JSON/,
    );
  });
});
