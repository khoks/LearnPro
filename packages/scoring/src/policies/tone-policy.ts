import { z } from "zod";
import { type LearnerProfile, type PolicyTelemetrySink, ToneSchema } from "./types.js";
import { NullPolicyTelemetrySink, digest } from "./telemetry.js";

export const ToneDecisionSchema = z.object({
  tone: ToneSchema,
  style_hints: z.array(z.string()),
});
export type ToneDecision = z.infer<typeof ToneDecisionSchema>;

export interface ToneContext {
  conversation_summary?: string;
  recent_struggle?: boolean;
}

export interface TonePolicy {
  readonly name: string;
  decide(input: { profile: LearnerProfile; context: ToneContext }): ToneDecision;
}

export class WarmCoachConstantPolicy implements TonePolicy {
  readonly name = "warm-coach-constant";

  constructor(private readonly telemetry: PolicyTelemetrySink = new NullPolicyTelemetrySink()) {}

  decide(input: { profile: LearnerProfile; context: ToneContext }): ToneDecision {
    const decision: ToneDecision = {
      tone: "warm-coach",
      style_hints: ["specific-not-generic", "reference-actual-code", "brief"],
    };

    this.telemetry.record({
      policy: "tone",
      implementation: this.name,
      user_id: input.profile.user_id,
      inputs_digest: digest(input.context),
      output_digest: digest(decision),
      decided_at: new Date().toISOString(),
    });

    return decision;
  }
}
