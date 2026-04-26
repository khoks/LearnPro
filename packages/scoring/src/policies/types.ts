import { z } from "zod";

export const DifficultyTierSchema = z.enum(["easy", "medium", "hard", "expert"]);
export type DifficultyTier = z.infer<typeof DifficultyTierSchema>;

export const AutonomyBandSchema = z.enum(["low", "medium", "high"]);
export type AutonomyBand = z.infer<typeof AutonomyBandSchema>;

export const ToneSchema = z.enum(["warm-coach", "drill-sergeant", "socratic-strict"]);
export type Tone = z.infer<typeof ToneSchema>;

export const EpisodeSummarySchema = z.object({
  episode_id: z.string(),
  user_id: z.string(),
  problem_id: z.string(),
  concept_ids: z.array(z.string()),
  difficulty: DifficultyTierSchema,
  passed: z.boolean(),
  hints_used: z.number().int().min(0),
  submit_count: z.number().int().min(1),
  reveal_clicked: z.boolean(),
  time_to_solve_ms: z.number().int().min(0),
});
export type EpisodeSummary = z.infer<typeof EpisodeSummarySchema>;

export const ConceptSkillSchema = z.object({
  concept_id: z.string(),
  skill: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  attempts: z.number().int().min(0),
});
export type ConceptSkill = z.infer<typeof ConceptSkillSchema>;

export const LearnerProfileSchema = z.object({
  user_id: z.string(),
  concept_skills: z.array(ConceptSkillSchema),
  recent_engagement: z.number().min(0).max(1),
  agreement_rate: z.number().min(0).max(1),
  episodes_count: z.number().int().min(0),
});
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;

export const ProblemRefSchema = z.object({
  problem_id: z.string(),
  concept_ids: z.array(z.string()),
  difficulty: DifficultyTierSchema,
});
export type ProblemRef = z.infer<typeof ProblemRefSchema>;

export const ActionConsequenceSchema = z.enum(["trivial", "consequential", "disruptive"]);
export type ActionConsequence = z.infer<typeof ActionConsequenceSchema>;

export const PolicyKindSchema = z.enum(["scoring", "tone", "difficulty", "autonomy"]);
export type PolicyKind = z.infer<typeof PolicyKindSchema>;

export const PolicyTelemetryEventSchema = z.object({
  policy: PolicyKindSchema,
  implementation: z.string(),
  user_id: z.string(),
  inputs_digest: z.string(),
  output_digest: z.string(),
  decided_at: z.string(),
});
export type PolicyTelemetryEvent = z.infer<typeof PolicyTelemetryEventSchema>;

export interface PolicyTelemetrySink {
  record(event: PolicyTelemetryEvent): void;
}
