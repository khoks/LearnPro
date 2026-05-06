// STORY-035 — eval-case + report schemas for the prompt eval harness.
//
// Eval cases live in evals/transcripts/*.json. Each case is a canned student transcript with:
//   - the prompt category (hint / grade / onboarding / session-plan)
//   - the system prompt version under test (matches packages/prompts versioning)
//   - input messages + structured context (rung, problem_slug, time_budget_min, etc.)
//   - expected behavior tags (LLM-as-judge rubric)
//   - explicit failure patterns (deterministic regex sweep — instant fail)
//
// Reports live in evals/reports/<timestamp>.json. Each report is keyed by its `version` so
// historical drift can be charted without parsing whatever schema-of-the-day is in HEAD.

import { z } from "zod";

export const EVAL_REPORT_VERSION = "eval-report-2026-05-01" as const;

export const EvalCategorySchema = z.enum(["hint", "grade", "onboarding", "session-plan"]);
export type EvalCategory = z.infer<typeof EvalCategorySchema>;

// Behavior tags are free-form strings — they're rubric items the judge LLM grades.
// We don't enumerate them globally; each case lists the tags relevant to its scenario.
// Convention: kebab-case, prefixed with "should-" or "should-not-".
export const ExpectedBehaviorTagSchema = z.string().min(3).max(120);
export type ExpectedBehaviorTag = z.infer<typeof ExpectedBehaviorTagSchema>;

// Deterministic failure pattern. `regex` matches the LLM response text. If it matches,
// the case fails fast — no LLM-judge call needed. `message` surfaces in the report.
export const ExplicitFailurePatternSchema = z.object({
  type: z.literal("regex"),
  pattern: z.string().min(1),
  flags: z.string().optional(),
  message: z.string().min(1),
});
export type ExplicitFailurePattern = z.infer<typeof ExplicitFailurePatternSchema>;

export const EvalChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});
export type EvalChatMessage = z.infer<typeof EvalChatMessageSchema>;

// Free-form context bag — each category's runner reads what it needs.
// `rung`/`problem_slug` for hint; `passed_tests`/`total_tests`/`user_code` for grade;
// `time_budget_min`/`recent_episodes` for session-plan; etc.
export const EvalContextSchema = z.record(z.string(), z.unknown());
export type EvalContext = z.infer<typeof EvalContextSchema>;

export const EvalInputSchema = z.object({
  messages: z.array(EvalChatMessageSchema).min(1),
  context: EvalContextSchema.default({}),
});
export type EvalInput = z.infer<typeof EvalInputSchema>;

export const EvalCaseSchema = z.object({
  id: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "id must be kebab-case (lowercase + digits + hyphens)"),
  category: EvalCategorySchema,
  // The prompt version under test. Authors bump this when the prompt under test changes
  // (matches PROMPT_VERSION / TUTOR_PROMPT_VERSION / GRADE_PROMPT_VERSION_TAG / etc.).
  system_prompt_under_test: z.string().min(1),
  input: EvalInputSchema,
  expected_behavior_tags: z.array(ExpectedBehaviorTagSchema).min(1),
  explicit_failure_patterns: z.array(ExplicitFailurePatternSchema).default([]),
  // Optional human-written notes about what this case is exercising. Not graded.
  notes: z.string().optional(),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

// ----------------------------------------------------------------------------
// Report schema
// ----------------------------------------------------------------------------

export const ExplicitFailureHitSchema = z.object({
  pattern: z.string(),
  message: z.string(),
});
export type ExplicitFailureHit = z.infer<typeof ExplicitFailureHitSchema>;

export const TagJudgmentSchema = z.object({
  tag: z.string(),
  passed: z.boolean(),
  reasoning: z.string(),
});
export type TagJudgment = z.infer<typeof TagJudgmentSchema>;

export const CaseResultSchema = z.object({
  id: z.string(),
  category: EvalCategorySchema,
  system_prompt_under_test: z.string(),
  passed: z.boolean(),
  // Deterministic check results — empty array means deterministic checks passed.
  explicit_failure_hits: z.array(ExplicitFailureHitSchema).default([]),
  json_shape_ok: z.boolean(),
  // Per-tag judge results. Empty when deterministic checks short-circuit the case.
  tag_judgments: z.array(TagJudgmentSchema).default([]),
  // The raw model response (truncated to keep reports reasonably-sized).
  response_text: z.string(),
  model: z.string(),
  latency_ms: z.number().int().min(0),
  cost_usd: z.number().min(0),
  error: z.string().optional(),
});
export type CaseResult = z.infer<typeof CaseResultSchema>;

export const TagAggregateSchema = z.object({
  tag: z.string(),
  total: z.number().int().min(0),
  passed: z.number().int().min(0),
  pass_rate: z.number().min(0).max(1),
});
export type TagAggregate = z.infer<typeof TagAggregateSchema>;

export const CategoryAggregateSchema = z.object({
  category: EvalCategorySchema,
  total: z.number().int().min(0),
  passed: z.number().int().min(0),
  pass_rate: z.number().min(0).max(1),
});
export type CategoryAggregate = z.infer<typeof CategoryAggregateSchema>;

export const EvalReportSchema = z.object({
  version: z.literal(EVAL_REPORT_VERSION),
  generated_at: z.string(),
  // Total cases run. `filter` is the optional category filter that was applied.
  total_cases: z.number().int().min(0),
  passed_cases: z.number().int().min(0),
  overall_pass_rate: z.number().min(0).max(1),
  filter: EvalCategorySchema.optional(),
  judge_model: z.string(),
  total_cost_usd: z.number().min(0),
  cases: z.array(CaseResultSchema),
  per_category: z.array(CategoryAggregateSchema),
  per_tag: z.array(TagAggregateSchema),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;
