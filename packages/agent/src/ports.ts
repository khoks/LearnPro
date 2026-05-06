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
