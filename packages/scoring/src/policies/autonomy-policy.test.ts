import { describe, expect, it } from "vitest";
import { AlwaysConfirmPolicy } from "./autonomy-policy.js";
import { InMemoryPolicyTelemetrySink } from "./telemetry.js";
import type { LearnerProfile } from "./types.js";

const profile: LearnerProfile = {
  user_id: "u1",
  concept_skills: [],
  recent_engagement: 0.5,
  agreement_rate: 0.5,
  episodes_count: 0,
};

describe("AlwaysConfirmPolicy", () => {
  it("always returns low band + confirm regardless of action consequence", () => {
    const policy = new AlwaysConfirmPolicy();
    expect(policy.decide({ profile, consequence: "trivial" }).mode).toBe("confirm");
    expect(policy.decide({ profile, consequence: "consequential" }).mode).toBe("confirm");
    expect(policy.decide({ profile, consequence: "disruptive" }).band).toBe("low");
  });

  it("emits telemetry events", () => {
    const sink = new InMemoryPolicyTelemetrySink();
    const policy = new AlwaysConfirmPolicy(sink);
    policy.decide({ profile, consequence: "trivial" });
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.policy).toBe("autonomy");
  });
});
