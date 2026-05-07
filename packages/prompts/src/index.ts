export const PACKAGE_NAME = "@learnpro/prompts";

// Versioned prompt registry. Populated as workflows land.
// See ADR-0006 for the per-workflow POLICY.md convention.

export {
  ONBOARDING_SYSTEM_PROMPT,
  PROMPT_VERSION as ONBOARDING_PROMPT_VERSION,
} from "./onboarding.js";

export {
  HINT_RUNG_XP_COST,
  TUTOR_PROMPT_VERSION,
  buildHintSystemPrompt,
  buildHintUserPrompt,
  type HintPromptOptions,
} from "./hint.js";

export {
  GRADE_PROMPT_VERSION_TAG,
  buildGradeSystemPrompt,
  buildGradeUserPrompt,
  type GradePromptOptions,
} from "./grade.js";

export {
  GRADE_PROMPT_VERSION,
  buildGradeAgentSystemPrompt,
  buildGradeAgentUserPrompt,
  type GradeAgentPromptOptions,
} from "./grade-prompt.js";

export {
  DEBUG_GRADE_PROMPT_VERSION,
  buildDebugGradeSystemPrompt,
  buildDebugGradeUserPrompt,
  type DebugGradePromptOptions,
} from "./debug-grade-prompt.js";

export {
  COMPREHENSION_GRADE_PROMPT_VERSION,
  buildComprehensionGradeSystemPrompt,
  buildComprehensionGradeUserPrompt,
  type ComprehensionGradePromptOptions,
} from "./comprehension-grade-prompt.js";

export {
  SESSION_PLAN_SYSTEM_PROMPT,
  PROMPT_VERSION as SESSION_PLAN_PROMPT_VERSION,
  buildSessionPlanUserPrompt,
  type SessionPlanPromptOptions,
} from "./session-plan.js";

export {
  ASSIGN_PROBLEM_PROMPT_VERSION,
  ASSIGN_PROBLEM_SYSTEM_PROMPT,
  buildAssignProblemUserPrompt,
  type AssignProblemPromptOptions,
} from "./assign-problem.js";

export {
  PROFILE_INSIGHTS_PROMPT_VERSION,
  PROFILE_INSIGHTS_SYSTEM_PROMPT,
  buildProfileInsightsUserPrompt,
  type ProfileInsightsEpisodeShape,
  type ProfileInsightsPromptOptions,
} from "./profile-insights-prompt.js";
export {
  CHEATSHEET_PROMPT_VERSION,
  buildCheatsheetSystemPrompt,
  buildCheatsheetUserPrompt,
  type CheatsheetEpisodeInput,
  type CheatsheetPromptOptions,
} from "./cheatsheet-prompt.js";
export {
  PROBLEM_VARIANTS_PROMPT_VERSION,
  buildProblemVariantsSystemPrompt,
  buildProblemVariantsUserPrompt,
  type ProblemVariantsPromptOptions,
  type ProblemVariantsPromptSourceShape,
} from "./problem-variants-prompt.js";
