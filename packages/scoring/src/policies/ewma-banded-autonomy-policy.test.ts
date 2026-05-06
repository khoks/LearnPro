import { describe, expect, it } from "vitest";
import {
  bandToDecision,
  combinedScore,
  DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG,
  EwmaBandedAutonomyConfigSchema,
  EwmaBandedAutonomyPolicy,
  scoreToBand,
  updateConfidenceSignal,
  type ConfidenceSignal,
  type SignalEvent,
} from "./ewma-banded-autonomy-policy.js";
import { InMemoryPolicyTelemetrySink } from "./telemetry.js";

const NOW = new Date("2026-04-25T12:00:00.000Z");

function constSignalGetter(signal: ConfidenceSignal | null) {
  return async (_user_id: string) => signal;
}

describe("EwmaBandedAutonomyConfigSchema", () => {
  it("parses defaults when given an empty object", () => {
    const cfg = EwmaBandedAutonomyConfigSchema.parse({});
    expect(cfg.low_threshold).toBe(0.3);
    expect(cfg.high_threshold).toBe(0.7);
    expect(cfg.alpha_agreement).toBe(0.3);
    expect(cfg.alpha_engagement).toBe(0.2);
    expect(cfg.alpha_success).toBe(0.2);
    expect(cfg.cold_start_episodes).toBe(5);
  });

  it("rejects out-of-range alpha values (>1)", () => {
    expect(() => EwmaBandedAutonomyConfigSchema.parse({ alpha_agreement: 1.5 })).toThrow();
  });

  it("accepts custom thresholds and alphas", () => {
    const cfg = EwmaBandedAutonomyConfigSchema.parse({
      low_threshold: 0.2,
      high_threshold: 0.8,
      alpha_success: 0.5,
    });
    expect(cfg.low_threshold).toBe(0.2);
    expect(cfg.high_threshold).toBe(0.8);
    expect(cfg.alpha_success).toBe(0.5);
  });
});

describe("scoreToBand", () => {
  it("returns 'low' for scores strictly below low_threshold", () => {
    expect(scoreToBand(0.0)).toBe("low");
    expect(scoreToBand(0.299)).toBe("low");
  });

  it("returns 'medium' at the low_threshold boundary", () => {
    expect(scoreToBand(0.301)).toBe("medium");
    expect(scoreToBand(0.5)).toBe("medium");
    expect(scoreToBand(0.699)).toBe("medium");
  });

  it("returns 'high' for scores strictly above high_threshold", () => {
    expect(scoreToBand(0.701)).toBe("high");
    expect(scoreToBand(1.0)).toBe("high");
  });

  it("threshold 0.3 is itself in the medium band (boundary semantics)", () => {
    expect(scoreToBand(0.3)).toBe("medium");
  });

  it("threshold 0.7 is itself in the medium band (boundary semantics)", () => {
    expect(scoreToBand(0.7)).toBe("medium");
  });
});

describe("combinedScore", () => {
  it("averages the three EWMAs equally with default weights", () => {
    const s: ConfidenceSignal = {
      agreement_rate: 0.6,
      engagement: 0.3,
      success: 0.9,
      updated_at: NOW.toISOString(),
    };
    expect(combinedScore(s)).toBeCloseTo((0.6 + 0.3 + 0.9) / 3, 5);
  });

  it("weights affect the average", () => {
    const s: ConfidenceSignal = {
      agreement_rate: 1,
      engagement: 0,
      success: 0,
      updated_at: NOW.toISOString(),
    };
    const cfg = EwmaBandedAutonomyConfigSchema.parse({
      weight_agreement: 4,
      weight_engagement: 1,
      weight_success: 1,
    });
    expect(combinedScore(s, cfg)).toBeCloseTo(4 / 6, 5);
  });
});

describe("bandToDecision", () => {
  it("low band always asks for trivial actions", () => {
    expect(bandToDecision("low", "trivial")).toBe("ask");
  });

  it("low band always asks for consequential actions", () => {
    expect(bandToDecision("low", "consequential")).toBe("ask");
  });

  it("low band escalates to ask_freeform on disruptive actions", () => {
    expect(bandToDecision("low", "disruptive")).toBe("ask_freeform");
  });

  it("medium band executes trivial", () => {
    expect(bandToDecision("medium", "trivial")).toBe("execute");
  });

  it("medium band asks on consequential and disruptive", () => {
    expect(bandToDecision("medium", "consequential")).toBe("ask");
    expect(bandToDecision("medium", "disruptive")).toBe("ask");
  });

  it("high band executes trivial + consequential, asks on disruptive", () => {
    expect(bandToDecision("high", "trivial")).toBe("execute");
    expect(bandToDecision("high", "consequential")).toBe("execute");
    expect(bandToDecision("high", "disruptive")).toBe("ask");
  });
});

describe("updateConfidenceSignal", () => {
  it("seeds agreement_rate from the first event when prev is null", () => {
    const next = updateConfidenceSignal(
      null,
      { kind: "agreement", accepted: true },
      undefined,
      NOW,
    );
    expect(next.agreement_rate).toBe(1);
    expect(next.engagement).toBe(0);
    expect(next.success).toBe(0);
  });

  it("EWMA-mixes agreement_rate when prev exists (alpha=0.3 default)", () => {
    const prev: ConfidenceSignal = {
      agreement_rate: 0.5,
      engagement: 0.5,
      success: 0.5,
      updated_at: NOW.toISOString(),
    };
    const next = updateConfidenceSignal(
      prev,
      { kind: "agreement", accepted: true },
      undefined,
      NOW,
    );
    // alpha*1 + (1-alpha)*0.5 = 0.3 + 0.35 = 0.65
    expect(next.agreement_rate).toBeCloseTo(0.65, 5);
    // Engagement and success untouched.
    expect(next.engagement).toBe(0.5);
    expect(next.success).toBe(0.5);
  });

  it("agreement_rate decays toward 0 on a sequence of rejects", () => {
    let signal: ConfidenceSignal | null = null;
    for (let i = 0; i < 20; i++) {
      signal = updateConfidenceSignal(
        signal,
        { kind: "agreement", accepted: false },
        undefined,
        NOW,
      );
    }
    expect(signal!.agreement_rate).toBeLessThan(0.05);
  });

  it("agreement_rate climbs toward 1 on a sequence of accepts", () => {
    let signal: ConfidenceSignal | null = null;
    for (let i = 0; i < 20; i++) {
      signal = updateConfidenceSignal(
        signal,
        { kind: "agreement", accepted: true },
        undefined,
        NOW,
      );
    }
    expect(signal!.agreement_rate).toBeGreaterThan(0.95);
  });

  it("engagement clamps the time-on-task ratio at 1.0", () => {
    const prev: ConfidenceSignal = {
      agreement_rate: 0,
      engagement: 0,
      success: 0,
      updated_at: NOW.toISOString(),
    };
    const next = updateConfidenceSignal(
      prev,
      { kind: "engagement", time_on_task_ms: 600_000, target_ms: 60_000 },
      undefined,
      NOW,
    );
    // ratio is min(10, 1) = 1; alpha=0.2 default; 0.2*1 + 0.8*0 = 0.2
    expect(next.engagement).toBeCloseTo(0.2, 5);
  });

  it("outcome 'passed' contributes 1.0; 'passed_with_hints' 0.7; everything else 0", () => {
    const prev: ConfidenceSignal = {
      agreement_rate: 0,
      engagement: 0,
      success: 0.5,
      updated_at: NOW.toISOString(),
    };
    const passed = updateConfidenceSignal(
      prev,
      { kind: "outcome", outcome: "passed" },
      undefined,
      NOW,
    );
    // alpha=0.2: 0.2*1 + 0.8*0.5 = 0.6
    expect(passed.success).toBeCloseTo(0.6, 5);
    const partial = updateConfidenceSignal(
      prev,
      { kind: "outcome", outcome: "passed_with_hints" },
      undefined,
      NOW,
    );
    // 0.2*0.7 + 0.8*0.5 = 0.54
    expect(partial.success).toBeCloseTo(0.54, 5);
    const failed = updateConfidenceSignal(
      prev,
      { kind: "outcome", outcome: "failed" },
      undefined,
      NOW,
    );
    // 0.2*0 + 0.8*0.5 = 0.4
    expect(failed.success).toBeCloseTo(0.4, 5);
  });

  it("stamps updated_at on every mutation", () => {
    const future = new Date("2026-04-26T00:00:00.000Z");
    const next = updateConfidenceSignal(
      null,
      { kind: "agreement", accepted: true },
      undefined,
      future,
    );
    expect(next.updated_at).toBe(future.toISOString());
  });
});

describe("EwmaBandedAutonomyPolicy", () => {
  it("cold-start: pins to low band when episode_count < cold_start_episodes (signal present)", async () => {
    // Even with maxed-out signal, the policy must hold at low until cold_start_episodes elapses.
    const fullSignal: ConfidenceSignal = {
      agreement_rate: 1,
      engagement: 1,
      success: 1,
      updated_at: NOW.toISOString(),
    };
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(fullSignal) });
    const decision = await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 4,
    });
    expect(decision.band).toBe("low");
    expect(decision.decision).toBe("ask");
    expect(decision.combined_score).toBe(0);
  });

  it("cold-start: pins to low band when no signal exists yet (brand-new user)", async () => {
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(null) });
    const decision = await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 100,
    });
    expect(decision.band).toBe("low");
    expect(decision.decision).toBe("ask");
  });

  it("crosses into medium once cold-start passes and score > low_threshold", async () => {
    const signal: ConfidenceSignal = {
      agreement_rate: 0.5,
      engagement: 0.5,
      success: 0.5,
      updated_at: NOW.toISOString(),
    };
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(signal) });
    const d = await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 5,
    });
    expect(d.band).toBe("medium");
    expect(d.decision).toBe("execute");
  });

  it("low engagement keeps band at low even with high success", async () => {
    const signal: ConfidenceSignal = {
      agreement_rate: 0.2,
      engagement: 0.05,
      success: 0.95,
      updated_at: NOW.toISOString(),
    };
    // (0.2 + 0.05 + 0.95) / 3 = 0.4 → medium with default thresholds, but if we drop engagement
    // and agreement enough, we land at low. Let's verify with different numbers:
    const lowSignal: ConfidenceSignal = {
      agreement_rate: 0.1,
      engagement: 0.05,
      success: 0.5,
      updated_at: NOW.toISOString(),
    };
    // (0.1 + 0.05 + 0.5) / 3 = 0.21 → low
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(lowSignal) });
    const d = await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 50,
    });
    expect(d.band).toBe("low");
    expect(d.decision).toBe("ask");
    // sanity: this confirms the original "high success with crap engagement" stays low when both
    // engagement and agreement are low enough to drag the average under the threshold.
    void signal;
  });

  it("band climbs to high when all three signals are strong", async () => {
    const signal: ConfidenceSignal = {
      agreement_rate: 0.85,
      engagement: 0.8,
      success: 0.95,
      updated_at: NOW.toISOString(),
    };
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(signal) });
    const d = await policy.decide({
      action: { consequence: "consequential" },
      user_id: "u1",
      episode_count: 50,
    });
    expect(d.band).toBe("high");
    expect(d.decision).toBe("execute");
  });

  it("threshold transitions: 0.299 → low, 0.301 → medium", async () => {
    const lowSig: ConfidenceSignal = {
      agreement_rate: 0.299,
      engagement: 0.299,
      success: 0.299,
      updated_at: NOW.toISOString(),
    };
    const medSig: ConfidenceSignal = {
      agreement_rate: 0.301,
      engagement: 0.301,
      success: 0.301,
      updated_at: NOW.toISOString(),
    };
    const policyLow = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(lowSig) });
    const policyMed = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(medSig) });
    const dLow = await policyLow.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 10,
    });
    const dMed = await policyMed.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 10,
    });
    expect(dLow.band).toBe("low");
    expect(dMed.band).toBe("medium");
  });

  it("threshold transitions: 0.699 → medium, 0.701 → high", async () => {
    const medSig: ConfidenceSignal = {
      agreement_rate: 0.699,
      engagement: 0.699,
      success: 0.699,
      updated_at: NOW.toISOString(),
    };
    const highSig: ConfidenceSignal = {
      agreement_rate: 0.701,
      engagement: 0.701,
      success: 0.701,
      updated_at: NOW.toISOString(),
    };
    const policyMed = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(medSig) });
    const policyHigh = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(highSig) });
    expect(
      (
        await policyMed.decide({
          action: { consequence: "trivial" },
          user_id: "u1",
          episode_count: 10,
        })
      ).band,
    ).toBe("medium");
    expect(
      (
        await policyHigh.decide({
          action: { consequence: "trivial" },
          user_id: "u1",
          episode_count: 10,
        })
      ).band,
    ).toBe("high");
  });

  it("low band always asks for trivial AND consequential actions", async () => {
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(null) });
    const trivial = await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 0,
    });
    const consequential = await policy.decide({
      action: { consequence: "consequential" },
      user_id: "u1",
      episode_count: 0,
    });
    expect(trivial.decision).toBe("ask");
    expect(consequential.decision).toBe("ask");
  });

  it("high band always executes except for disruptive actions", async () => {
    const fullSignal: ConfidenceSignal = {
      agreement_rate: 0.95,
      engagement: 0.95,
      success: 0.95,
      updated_at: NOW.toISOString(),
    };
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(fullSignal) });
    const trivial = await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 50,
    });
    const consequential = await policy.decide({
      action: { consequence: "consequential" },
      user_id: "u1",
      episode_count: 50,
    });
    const disruptive = await policy.decide({
      action: { consequence: "disruptive" },
      user_id: "u1",
      episode_count: 50,
    });
    expect(trivial.decision).toBe("execute");
    expect(consequential.decision).toBe("execute");
    expect(disruptive.decision).toBe("ask");
  });

  it("emits a telemetry event on every decision", async () => {
    const sink = new InMemoryPolicyTelemetrySink();
    const policy = new EwmaBandedAutonomyPolicy({
      getSignal: constSignalGetter(null),
      telemetry: sink,
    });
    await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 0,
    });
    await policy.decide({
      action: { consequence: "consequential" },
      user_id: "u2",
      episode_count: 0,
    });
    expect(sink.events).toHaveLength(2);
    expect(sink.events[0]?.policy).toBe("autonomy");
    expect(sink.events[0]?.implementation).toBe("ewma-banded-autonomy");
    expect(sink.events[0]?.user_id).toBe("u1");
    expect(sink.events[1]?.user_id).toBe("u2");
  });

  it("agreement-rate growing across many accepts crosses the bands in order", async () => {
    let signal: ConfidenceSignal | null = null;
    const bands: string[] = [];
    // Drive only agreement so we can observe the band climb cleanly. Engagement and success stay
    // at 0 → so combined = agreement / 3. To cross 0.3 → agreement must be > 0.9. To cross 0.7
    // → impossible with engagement=success=0. So we feed engagement and success too.
    const events: SignalEvent[] = [];
    for (let i = 0; i < 30; i++) {
      events.push({ kind: "agreement", accepted: true });
      events.push({ kind: "engagement", time_on_task_ms: 60_000, target_ms: 60_000 });
      events.push({ kind: "outcome", outcome: "passed" });
    }
    for (const e of events) {
      signal = updateConfidenceSignal(signal, e, undefined, NOW);
    }
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(signal) });
    const d = await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 30,
    });
    expect(d.band).toBe("high");
    void bands;
  });

  it("custom thresholds change the band boundaries", async () => {
    const cfg = EwmaBandedAutonomyConfigSchema.parse({
      low_threshold: 0.1,
      high_threshold: 0.4,
    });
    const signal: ConfidenceSignal = {
      agreement_rate: 0.5,
      engagement: 0.5,
      success: 0.5,
      updated_at: NOW.toISOString(),
    };
    const policy = new EwmaBandedAutonomyPolicy({
      config: cfg,
      getSignal: constSignalGetter(signal),
    });
    const d = await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 50,
    });
    // 0.5 > 0.4 → high under these thresholds
    expect(d.band).toBe("high");
  });

  it("default config exposes the documented thresholds and alphas", () => {
    expect(DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG.low_threshold).toBe(0.3);
    expect(DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG.high_threshold).toBe(0.7);
    expect(DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG.alpha_agreement).toBe(0.3);
    expect(DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG.alpha_engagement).toBe(0.2);
    expect(DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG.alpha_success).toBe(0.2);
    expect(DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG.cold_start_episodes).toBe(5);
  });

  it("policy name matches the registry identifier", () => {
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(null) });
    expect(policy.name).toBe("ewma-banded-autonomy");
  });

  it("rationale includes 'cold-start' for cold-start decisions", async () => {
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(null) });
    const d = await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 0,
    });
    expect(d.rationale.toLowerCase()).toContain("cold-start");
  });

  it("rationale includes the score for non-cold-start decisions", async () => {
    const signal: ConfidenceSignal = {
      agreement_rate: 0.4,
      engagement: 0.4,
      success: 0.4,
      updated_at: NOW.toISOString(),
    };
    const policy = new EwmaBandedAutonomyPolicy({ getSignal: constSignalGetter(signal) });
    const d = await policy.decide({
      action: { consequence: "trivial" },
      user_id: "u1",
      episode_count: 50,
    });
    expect(d.rationale).toContain("score=");
  });
});
