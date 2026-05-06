import { z } from "zod";
import {
  AutonomyBandSchema,
  type ActionConsequence,
  type AutonomyBand,
  type PolicyTelemetrySink,
} from "./types.js";
import { NullPolicyTelemetrySink, digest } from "./telemetry.js";

// STORY-054 — adaptive autonomy controller. Lives alongside `AlwaysConfirmPolicy` (the cold-start
// MVP default). Production wires this via `defaultsFromEnv()`; tests still default to
// AlwaysConfirm so transcripts stay deterministic.

export const ConfidenceSignalSchema = z.object({
  agreement_rate: z.number().min(0).max(1),
  engagement: z.number().min(0).max(1),
  success: z.number().min(0).max(1),
  updated_at: z.string().datetime({ offset: true }),
});
export type ConfidenceSignal = z.infer<typeof ConfidenceSignalSchema>;

export const EwmaBandedAutonomyConfigSchema = z.object({
  low_threshold: z.number().min(0).max(1).default(0.3),
  high_threshold: z.number().min(0).max(1).default(0.7),
  alpha_agreement: z.number().min(0).max(1).default(0.3),
  alpha_engagement: z.number().min(0).max(1).default(0.2),
  alpha_success: z.number().min(0).max(1).default(0.2),
  cold_start_episodes: z.number().int().min(0).default(5),
  weight_agreement: z.number().min(0).default(1),
  weight_engagement: z.number().min(0).default(1),
  weight_success: z.number().min(0).default(1),
});
export type EwmaBandedAutonomyConfig = z.infer<typeof EwmaBandedAutonomyConfigSchema>;

export const DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG: EwmaBandedAutonomyConfig =
  EwmaBandedAutonomyConfigSchema.parse({});

// The decision shape for the new policy. We deliberately keep `band` separate from `decision` so
// telemetry can audit the band even when the band doesn't change the action (e.g. low-band always
// asks regardless of consequence).
export const AutonomyBandedDecisionSchema = z.object({
  band: AutonomyBandSchema,
  decision: z.enum(["ask", "execute", "ask_freeform"]),
  rationale: z.string(),
  combined_score: z.number().min(0).max(1),
});
export type AutonomyBandedDecision = z.infer<typeof AutonomyBandedDecisionSchema>;

export interface AutonomyDecisionInput {
  action: { consequence: ActionConsequence; kind?: string };
  user_id: string;
  episode_count: number;
}

export type GetConfidenceSignalFn = (user_id: string) => Promise<ConfidenceSignal | null>;

// Async variant of `AutonomyPolicy` — the EWMA implementation has to load the per-user signal
// from the DB. We don't extend AutonomyPolicy directly because that interface (from STORY-057) is
// sync; the wiring layer awaits this method and adapts it to the sync caller surface where needed.
export interface AsyncAutonomyPolicy {
  readonly name: string;
  decide(input: AutonomyDecisionInput): Promise<AutonomyBandedDecision>;
}

export class EwmaBandedAutonomyPolicy implements AsyncAutonomyPolicy {
  readonly name = "ewma-banded-autonomy";
  private readonly config: EwmaBandedAutonomyConfig;
  private readonly telemetry: PolicyTelemetrySink;
  private readonly getSignal: GetConfidenceSignalFn;

  constructor(opts: {
    config?: EwmaBandedAutonomyConfig;
    telemetry?: PolicyTelemetrySink;
    getSignal: GetConfidenceSignalFn;
  }) {
    this.config = opts.config ?? DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG;
    this.telemetry = opts.telemetry ?? new NullPolicyTelemetrySink();
    this.getSignal = opts.getSignal;
  }

  async decide(input: AutonomyDecisionInput): Promise<AutonomyBandedDecision> {
    const signal = await this.getSignal(input.user_id);
    const decision = this.computeDecision(signal, input);

    this.telemetry.record({
      policy: "autonomy",
      implementation: this.name,
      user_id: input.user_id,
      inputs_digest: digest({
        consequence: input.action.consequence,
        episode_count: input.episode_count,
        signal_present: signal !== null,
      }),
      output_digest: digest(decision),
      decided_at: new Date().toISOString(),
    });

    return decision;
  }

  private computeDecision(
    signal: ConfidenceSignal | null,
    input: AutonomyDecisionInput,
  ): AutonomyBandedDecision {
    // Cold-start safety: brand-new users (or any user under the cold_start_episodes threshold)
    // get the low band regardless of any in-memory signal we might have. This is non-negotiable —
    // STORY-054 AC #5.
    if (signal === null || input.episode_count < this.config.cold_start_episodes) {
      return {
        band: "low",
        decision: bandToDecision("low", input.action.consequence),
        rationale: `cold-start (episodes=${input.episode_count}, signal=${signal === null ? "null" : "present"}) → low`,
        combined_score: 0,
      };
    }

    const score = combinedScore(signal, this.config);
    const band = scoreToBand(score, this.config);

    return {
      band,
      decision: bandToDecision(band, input.action.consequence),
      rationale: `score=${score.toFixed(3)} → band=${band}`,
      combined_score: score,
    };
  }
}

export function combinedScore(
  signal: ConfidenceSignal,
  config: EwmaBandedAutonomyConfig = DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG,
): number {
  const wA = config.weight_agreement;
  const wE = config.weight_engagement;
  const wS = config.weight_success;
  const total = wA + wE + wS;
  if (total === 0) return 0;
  return (signal.agreement_rate * wA + signal.engagement * wE + signal.success * wS) / total;
}

export function scoreToBand(
  score: number,
  config: EwmaBandedAutonomyConfig = DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG,
): AutonomyBand {
  if (score < config.low_threshold) return "low";
  if (score > config.high_threshold) return "high";
  return "medium";
}

// Banded rule:
//   low    → always ask before acting (cold-start mode).
//   medium → execute trivial; ask before consequential / disruptive.
//   high   → execute trivial + consequential; ask only on disruptive (track-switch, etc.).
// `ask_freeform` is reserved for future call sites that need open-ended user input (e.g. "tell me
// what you'd like to work on"); the policy returns it for low-band on disruptive actions so the
// consumer can prompt the user with an open question rather than a yes/no.
export function bandToDecision(
  band: AutonomyBand,
  consequence: ActionConsequence,
): "ask" | "execute" | "ask_freeform" {
  if (band === "low") {
    if (consequence === "disruptive") return "ask_freeform";
    return "ask";
  }
  if (band === "medium") {
    if (consequence === "trivial") return "execute";
    return "ask";
  }
  // band === "high"
  if (consequence === "disruptive") return "ask";
  return "execute";
}

// EWMA update for the user's confidence signal. Pure function — the DB-backed updater wraps this
// and persists. Each event drives one of the three EWMAs forward; the others stay put.
//
// `accept` events (agreement = 1) and `reject` events (agreement = 0) update agreement_rate.
// `engagement` updates the engagement EWMA against the time-on-task ratio (clamped to 1.0).
// `outcome` events drive success: passed=1, passed_with_hints=0.7, failed/abandoned/revealed=0.
//
// The cold-start case (`prev === null`) seeds the EWMAs from the event so the first datapoint
// fully drives the signal — keeps the "first 5 episodes" cold-start window honest.
export type SignalEvent =
  | { kind: "agreement"; accepted: boolean }
  | { kind: "engagement"; time_on_task_ms: number; target_ms: number }
  | {
      kind: "outcome";
      outcome: "passed" | "passed_with_hints" | "failed" | "abandoned" | "revealed";
    };

export function updateConfidenceSignal(
  prev: ConfidenceSignal | null,
  event: SignalEvent,
  config: EwmaBandedAutonomyConfig = DEFAULT_EWMA_BANDED_AUTONOMY_CONFIG,
  now: Date = new Date(),
): ConfidenceSignal {
  const seed: ConfidenceSignal = prev ?? {
    agreement_rate: 0,
    engagement: 0,
    success: 0,
    updated_at: now.toISOString(),
  };

  if (event.kind === "agreement") {
    const x = event.accepted ? 1 : 0;
    return {
      ...seed,
      agreement_rate: prev ? mix(seed.agreement_rate, x, config.alpha_agreement) : x,
      updated_at: now.toISOString(),
    };
  }

  if (event.kind === "engagement") {
    const target = Math.max(1, event.target_ms);
    const ratio = Math.min(1, event.time_on_task_ms / target);
    return {
      ...seed,
      engagement: prev ? mix(seed.engagement, ratio, config.alpha_engagement) : ratio,
      updated_at: now.toISOString(),
    };
  }

  // event.kind === "outcome"
  const x = outcomeScore(event.outcome);
  return {
    ...seed,
    success: prev ? mix(seed.success, x, config.alpha_success) : x,
    updated_at: now.toISOString(),
  };
}

function outcomeScore(
  outcome: "passed" | "passed_with_hints" | "failed" | "abandoned" | "revealed",
): number {
  if (outcome === "passed") return 1;
  if (outcome === "passed_with_hints") return 0.7;
  return 0;
}

function mix(prev: number, next: number, alpha: number): number {
  return alpha * next + (1 - alpha) * prev;
}
