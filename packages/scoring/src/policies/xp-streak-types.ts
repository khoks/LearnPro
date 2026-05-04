import { z } from "zod";

// Mirrors the DB `episode_outcome` pgEnum + the `FinalOutcomeSchema` in @learnpro/agent. Held
// here so @learnpro/scoring stays a leaf package (no dependency on @learnpro/db or
// @learnpro/agent). If a future Story consolidates these in @learnpro/shared, this becomes a
// re-export.
export const FinalOutcomeSchema = z.enum([
  "passed",
  "passed_with_hints",
  "failed",
  "abandoned",
  "revealed",
]);
export type FinalOutcome = z.infer<typeof FinalOutcomeSchema>;
