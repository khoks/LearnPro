import type { ProblemDef } from "@learnpro/problems";
import type { EpisodeSignalInput } from "@learnpro/scoring";
import type { ConceptSkill, DifficultyTier } from "@learnpro/scoring";
import type { FinalOutcome, HintRecord, HintRung } from "./state.js";

// The agent talks to the rest of the system through narrow ports — one per side-effect surface.
// This keeps the tools pure-ish (input → output + a side-effect call) and lets tests inject fakes
// without mocking Drizzle, Anthropic, or the sandbox HTTP transport.
//
// Each port maps 1:1 onto a concrete adapter in apps/api (Drizzle / LLMProvider / SandboxProvider).
// We deliberately keep these small: a port is whatever the agent needs, not a generic gateway.

export interface AssignProblemDeps {
  // Returns the user's recent episodes for difficulty signal computation. Newest-first by
  // started_at. The caller decides the limit; a reasonable default is 10.
  loadRecentEpisodes(input: {
    user_id: string;
    track_id: string;
    limit: number;
  }): Promise<RecentEpisode[]>;

  // Returns the candidate problem catalog filtered to a single track. The agent then narrows
  // by difficulty + recency.
  loadProblemCatalog(input: { track_id: string }): Promise<ProblemCatalogEntry[]>;

  // Creates the in-progress episode row and returns its id.
  createEpisode(input: {
    user_id: string;
    org_id: string;
    problem_id: string;
  }): Promise<{ episode_id: string; started_at: number }>;

  // STORY-031 — returns the kebab-case concept slugs the user is due to review (FSRS state.due
  // <= now). Optional: when omitted, the assigner skips the spaced-repetition tie-break and
  // behaves identically to its pre-STORY-031 self. The deps adapter in apps/api wires this
  // through `getDueConcepts` + a concept-id -> slug mapping.
  loadDueConceptSlugs?(input: { user_id: string }): Promise<string[]>;

  // STORY-033 — returns the latest 1-3 active cross-episode insights for the user. Optional:
  // when omitted, the assigner skips the insight context surface entirely (no rows surfaced;
  // no telemetry bumps). The deps adapter in apps/api wires this through @learnpro/db's
  // `listLatestInsights`. Returns rows oldest-first (the prompt prefers chronological order).
  loadLatestInsights?(input: { user_id: string; limit: number }): Promise<AssignProblemInsight[]>;

  // STORY-033 — bumps `referenced_count` on an insight row. Best-effort: the tool calls this
  // for each insight whose `text` is mentioned in the most-recent tutor opener. When omitted,
  // the bump is silently skipped (the insight row stays at its existing count).
  incrementInsightReferenced?(input: { insight_id: string }): Promise<void>;
}

// STORY-033 — minimal projection of a `profile_insights` row the assigner cares about.
export interface AssignProblemInsight {
  id: string;
  text: string;
}

// Minimal projection of `episodes` rows the assigner needs.
export interface RecentEpisode {
  problem_id: string;
  problem_slug: string;
  started_at: number;
  // Last difficulty tier for this problem; null if unknown (e.g., legacy row pre-tier-coercion).
  difficulty: DifficultyTier | null;
  // Reproducing EpisodeSignalInput so the heuristic can be applied against the most-recent episode.
  signal: EpisodeSignalInput | null;
  final_outcome: FinalOutcome | null;
}

// Normalized catalog entry — we keep a reference to the on-disk ProblemDef so the rest of the
// agent (statement, reference_solution, hidden tests, expected_median_time) can read it without
// re-parsing YAML.
export interface ProblemCatalogEntry {
  problem_id: string;
  problem_slug: string;
  def: ProblemDef;
}

export interface GiveHintDeps {
  // Looks up the problem definition for an episode (used to seed the hint prompt).
  loadEpisodeProblem(input: { episode_id: string }): Promise<HintEpisodeContext | null>;

  // Calls the LLM to generate a hint at a specific rung. Returns just the hint text — the tool
  // writes the agent_calls row + computes the XP cost.
  generateHint(input: {
    user_id: string;
    rung: HintRung;
    problem: ProblemDef;
    prior_hints: HintRecord[];
  }): Promise<{ hint: string }>;

  // Called once per hint to bump the episode counter. Idempotency is the caller's problem.
  incrementHintsUsed(input: { episode_id: string }): Promise<void>;
}

export interface HintEpisodeContext {
  episode_id: string;
  user_id: string;
  problem_id: string;
  problem: ProblemDef;
  prior_hints: HintRecord[];
}

export interface GradeDeps {
  loadEpisodeProblem(input: { episode_id: string }): Promise<GradeEpisodeContext | null>;

  // Runs the user's submission against the problem's hidden tests via the sandbox + per-language
  // verdict harness from @learnpro/problems. Returns one entry per hidden test.
  runHiddenTests(input: { problem: ProblemDef; user_code: string }): Promise<HiddenTestResult[]>;

  // LLM rubric call. Returns a structured grade + a 1-2 sentence prose explanation.
  generateRubric(input: {
    user_id: string;
    problem: ProblemDef;
    user_code: string;
    test_results: HiddenTestResult[];
  }): Promise<{ rubric: GradeRubric; prose_explanation: string }>;

  // Persists the submission row.
  recordSubmission(input: {
    episode_id: string;
    user_id: string;
    org_id: string;
    code: string;
    passed: boolean;
    runtime_ms: number;
  }): Promise<{ submission_id: string }>;

  // STORY-034 — split critique/grader agent. Optional: when wired, the tool calls this AFTER the
  // tests-as-floor pass/fail check; the production adapter drives `gradeAgent` (Haiku, cooler
  // tone) and persists the rubric to the episode row. When unwired, the tool skips the grader
  // step (GradeOutput.grader is null) — keeps the unified-tutor codepath as a fallback for the
  // A/B comparison and for tests that don't want to mock yet another LLM.
  runGraderAgent?(input: {
    episode_id: string;
    user_id: string;
    org_id: string;
    problem: ProblemDef;
    user_code: string;
    test_results: HiddenTestResult[];
  }): Promise<GraderAgentRubric>;

  // STORY-034 — persists the grader's rubric to the episode row. Optional, mirrors
  // `runGraderAgent` so adapters can wire either both or neither.
  persistGraderRubric?(input: { episode_id: string; rubric: GraderAgentRubric }): Promise<void>;
}

export interface GradeEpisodeContext {
  episode_id: string;
  user_id: string;
  org_id: string;
  problem_id: string;
  problem: ProblemDef;
}

export interface HiddenTestResult {
  index: number;
  passed: boolean;
  detail?: string;
  expected?: unknown;
  got?: unknown;
}

export interface GradeRubric {
  correctness: number;
  idiomatic: number;
  edge_case_coverage: number;
}

// STORY-034 — split critique/grader agent rubric on the wire. Mirrors the `gradeAgent` return
// shape but typed here in `ports.ts` so this leaf module stays the source-of-truth for cross-tool
// types (the agent module imports this type).
export interface GraderAgentRubric {
  pass: boolean;
  rubric: {
    idiomatic: 1 | 2 | 3 | 4 | 5;
    efficiency: 1 | 2 | 3 | 4 | 5;
    test_coverage_thinking: 1 | 2 | 3 | 4 | 5;
  };
  reasoning: string;
  fallback_used: boolean;
}

export interface UpdateProfileDeps {
  loadEpisodeForClose(input: { episode_id: string }): Promise<UpdateProfileEpisodeContext | null>;

  closeEpisode(input: {
    episode_id: string;
    final_outcome: FinalOutcome;
    time_to_solve_ms: number;
    attempts: number;
    hints_used: number;
  }): Promise<void>;

  // Per-concept skill score UPSERT — the agent computes the new ConceptSkill and hands it over.
  upsertSkillScore(input: {
    user_id: string;
    org_id: string;
    concept_id: string;
    skill: ConceptSkill;
  }): Promise<void>;

  // Resolves problem concept_tags (kebab-case slugs) to concept_ids in the DB. Missing tags are
  // skipped (legacy behavior — concept population is STORY-032's job).
  resolveConceptIds(input: {
    org_id: string;
    language: "python" | "typescript";
    slugs: string[];
  }): Promise<Map<string, string>>;

  // Reads the current skill_score row for a (user, concept) — null when none exists yet (which is
  // the cold-start case for a new concept).
  loadSkillScore(input: { user_id: string; concept_id: string }): Promise<ConceptSkill | null>;

  // Idempotently awards XP for a closed episode. The implementation in apps/api wires through
  // @learnpro/db's awardXp, which uses ON CONFLICT DO NOTHING on (user_id, episode_id, reason)
  // so re-running grade for the same episode never double-awards. The tool always calls this —
  // even for failed/abandoned episodes — so the user's "you tried 12 problems" history is
  // complete (failed grants are amount=0).
  awardXp(input: AwardXpForEpisodeInput): Promise<AwardXpForEpisodeResult>;

  // STORY-015 — auto-mark the matching pending session plan item completed on episode close.
  // Optional: when the planner isn't wired the deps adapter returns null, so updateProfile
  // skips the auto-mark step. Idempotency is the implementation's problem (markItemCompleted
  // in @learnpro/db is a no-op for already-completed items).
  markPlanItemCompleted?(input: {
    user_id: string;
    problem_slug: string;
    episode_id: string;
  }): Promise<{ updated: boolean }>;

  // STORY-054 — refresh the user's confidence_signal EWMA after an episode closes. Optional:
  // when the autonomy controller isn't wired the deps adapter omits this and updateProfile skips
  // the signal update. Idempotency is best-effort: re-grading the same episode is rare on the
  // request path; if it ever happens, the signal absorbs a slight drift, which the next legitimate
  // close will dampen out (alpha=0.2).
  refreshConfidenceSignal?(input: {
    user_id: string;
    org_id: string;
    episode_id: string;
    final_outcome: FinalOutcome;
    time_to_solve_ms: number;
    expected_time_ms: number;
  }): Promise<void>;

  // STORY-031 — load the FSRS card state for one (user, concept). Optional: when unwired,
  // updateProfile skips the spaced-repetition write. Returns null on cold-start (the tool seeds
  // an `initialCardState()` from @learnpro/scoring before recomputing).
  loadConceptCardState?(input: {
    user_id: string;
    concept_id: string;
  }): Promise<FsrsCardStateLike | null>;

  // STORY-031 — persist the recomputed FSRS card state. Idempotency: the underlying DB helper
  // UPSERTs on (user_id, concept_id), so re-grading the same episode just refreshes the row
  // (total_reviews advances by 1 each call — accepted as best-effort approximation per
  // STORY-031). The deps adapter in apps/api wires this through `recordReview`.
  recordConceptReview?(input: {
    user_id: string;
    org_id: string;
    concept_id: string;
    next_state: FsrsCardStateLike;
  }): Promise<void>;

  // STORY-031 — count how many of the user's concept cards are due `now`. Optional. Used to
  // surface the "N more due" delta in the tool's output. Cheap call (capped at 50 in DB
  // helper). When unwired, the tool returns null for due_reviews_count.
  countDueConcepts?(input: { user_id: string }): Promise<number>;

  // STORY-038a — per-(user, concept_tag) comprehension-policy EWMA upsert. Optional: when wired,
  // updateProfile fires it once per concept_tag on the most-recent comprehension submission's
  // verdict. Mirrors the bug-finding-policy upsert pattern (STORY-037a). When unwired, the
  // comprehension axis simply doesn't update — a partial deployment that hasn't migrated the
  // backing table can still process comprehension submissions; the verdict surfaces in the
  // GradeOutput, the EWMA just doesn't move.
  upsertComprehensionScore?(input: {
    user_id: string;
    org_id: string;
    concept_tag: string;
    correct: boolean;
    got_help: boolean;
  }): Promise<void>;
}

// Structural shape of the persisted FSRS card state. Lives here (not imported from
// @learnpro/scoring) so this `ports.ts` stays a leaf — the agent package depends on @learnpro/db
// indirectly through the deps adapters in apps/api. The tool implementation imports the real
// `FsrsCardState` type from @learnpro/scoring.
export interface FsrsCardStateLike {
  stability: number;
  difficulty: number;
  due: string;
  lapses: number;
  last_reviewed: string | null;
}

export interface AwardXpForEpisodeInput {
  user_id: string;
  org_id: string;
  episode_id: string;
  amount: number;
  reason: string;
}

export interface AwardXpForEpisodeResult {
  inserted: boolean;
  amount: number;
}

export interface UpdateProfileEpisodeContext {
  episode_id: string;
  user_id: string;
  org_id: string;
  problem: ProblemDef;
  hints_used: number;
  attempts: number;
  started_at: number;
}

// STORY-038a — narrow port for the comprehension grade dispatch. The grade tool calls this
// when `episode.problem.kind === "comprehension"`. Production wires this to
// `gradeComprehension` in @learnpro/agent (deterministic for multiple-choice, Haiku LLM rubric
// for free-text); tests inject a fake. Optional on `createGradeTool({ comprehensionDeps })` —
// when absent the tool throws ComprehensionDepsNotWiredError so a comprehension YAML can never
// silently no-op on a server that didn't wire the LLM provider.
export interface ComprehensionGradeDeps {
  gradeComprehensionAnswer(
    input: ComprehensionGradeDepsInput,
  ): Promise<ComprehensionGradeDepsResult>;
}

export interface ComprehensionGradeDepsInput {
  episode_id: string;
  user_id: string;
  problem: ComprehensionProblemDefShape;
  answer: ComprehensionAnswerShape;
}

// Structural shape of the comprehension problem the deps adapter accepts. Mirrors
// `ComprehensionProblemDef` from @learnpro/problems but typed here in `ports.ts` so this leaf
// module stays the source-of-truth for cross-tool types (the agent module imports this type).
// The tool implementation imports the real `ComprehensionProblemDef` from @learnpro/problems
// and TypeScript's structural typing accepts the assignment.
export interface ComprehensionProblemDefShape {
  kind: "comprehension";
  slug: string;
  name: string;
  language: "python" | "typescript";
  comprehension_format: "predict_output" | "trace_execution" | "reason_property";
  question: string;
  answer_format: "multiple_choice" | "free_text";
  multiple_choice_options?: ReadonlyArray<string>;
  correct_answer_index?: number;
  expected_answer?: string;
  explanation: string;
  starter_code: string;
  concept_tags: ReadonlyArray<string>;
  difficulty: number;
}

// Structural shape of the comprehension answer the user submits. Mirrors
// `ComprehensionAnswer` from `comprehension-grade.ts` but typed here so the leaf is consistent.
export type ComprehensionAnswerShape =
  | { kind: "multiple_choice"; selected_index: number }
  | { kind: "free_text"; text: string };

export interface ComprehensionGradeDepsResult {
  correct: boolean;
  reasoning: string;
  explanation: string;
  fallback_used: boolean;
}

// STORY-015 — session-plan agent. The planner LLM call is a one-shot completion (no tool use).
// The deps surface keeps the agent free of LLM SDK / DB knowledge; the production wiring in
// apps/api passes a `generatePlan` adapter that calls Haiku with the SESSION_PLAN_SYSTEM_PROMPT
// and the apps/api wiring writes the resulting plan via @learnpro/db's createPlan helper.
export interface PlanSessionDeps {
  generatePlan(input: PlanSessionGenerateInput): Promise<PlanSessionGenerateOutput>;
}

export interface PlanSessionRecentEpisode {
  slug: string;
  final_outcome: string | null;
  difficulty: string | null;
}

export interface PlanSessionGenerateInput {
  user_id: string;
  time_budget_min: number;
  target_role: string | null;
  primary_goal: string | null;
  current_track: string;
  recent_episodes: ReadonlyArray<PlanSessionRecentEpisode>;
}

// `raw_text` is the LLM's verbatim response — the tool parses + Zod-validates it; on parse
// failure we fall back to a deterministic 3-item plan so the route never 500s.
export interface PlanSessionGenerateOutput {
  raw_text: string;
}
