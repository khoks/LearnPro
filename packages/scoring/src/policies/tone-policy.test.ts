import { describe, expect, it } from "vitest";
import { WarmCoachConstantPolicy } from "./tone-policy.js";
import { InMemoryPolicyTelemetrySink } from "./telemetry.js";
import type { LearnerProfile } from "./types.js";

const profile: LearnerProfile = {
  user_id: "u1",
  concept_skills: [],
  recent_engagement: 0.5,
  agreement_rate: 0.5,
  episodes_count: 0,
};

describe("WarmCoachConstantPolicy", () => {
  it("always returns warm-coach with the canonical style hints", () => {
    const policy = new WarmCoachConstantPolicy();
    const result = policy.decide({ profile, context: { recent_struggle: true } });
    expect(result.tone).toBe("warm-coach");
    expect(result.style_hints).toContain("reference-actual-code");
  });

  it("emits a telemetry event for every decision", () => {
    const sink = new InMemoryPolicyTelemetrySink();
    const policy = new WarmCoachConstantPolicy(sink);
    policy.decide({ profile, context: {} });
    policy.decide({ profile, context: { recent_struggle: true } });
    expect(sink.events).toHaveLength(2);
    expect(sink.events.every((e) => e.policy === "tone")).toBe(true);
  });
});
