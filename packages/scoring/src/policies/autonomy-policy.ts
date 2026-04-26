import { z } from "zod";
import {
  type ActionConsequence,
  AutonomyBandSchema,
  type LearnerProfile,
  type PolicyTelemetrySink,
} from "./types.js";
import { NullPolicyTelemetrySink, digest } from "./telemetry.js";

export const AutonomyDecisionSchema = z.object({
  band: AutonomyBandSchema,
  mode: z.enum(["execute", "confirm", "ask"]),
  rationale: z.string(),
});
export type AutonomyDecision = z.infer<typeof AutonomyDecisionSchema>;

export interface AutonomyPolicy {
  readonly name: string;
  decide(input: { profile: LearnerProfile; consequence: ActionConsequence }): AutonomyDecision;
}

export class AlwaysConfirmPolicy implements AutonomyPolicy {
  readonly name = "always-confirm";

  constructor(private readonly telemetry: PolicyTelemetrySink = new NullPolicyTelemetrySink()) {}

  decide(input: { profile: LearnerProfile; consequence: ActionConsequence }): AutonomyDecision {
    const decision: AutonomyDecision = {
      band: "low",
      mode: "confirm",
      rationale: "MVP cold-start: always confirm before acting",
    };

    this.telemetry.record({
      policy: "autonomy",
      implementation: this.name,
      user_id: input.profile.user_id,
      inputs_digest: digest(input.consequence),
      output_digest: digest(decision),
      decided_at: new Date().toISOString(),
    });

    return decision;
  }
}
