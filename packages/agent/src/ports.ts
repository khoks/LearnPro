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
  runHiddenTests(input: {
    problem: ProblemDef;
    user_code: string;
  }): Promise<HiddenTestResult[]>;

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
  loadSkillScore(input: {
    user_id: string;
    concept_id: string;
  }): Promise<ConceptSkill | null>;
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
