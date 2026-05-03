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
