// STORY-046c — pure agent that asks Haiku for a 1-line theme name for a weekly plan.
//
// Replaces STORY-046b's "<concept_name> week" fallback when an LLMProvider is wired and the
// week has at least 3 theme concepts. The function is best-effort: any parse failure or
// validation rejection returns null, and the caller falls back to the deterministic concept
// name behavior.
//
// Cost gate: a single Haiku call per generation. The route handler controls when this fires
// (only on `POST /v1/weekly-plan/replan`, never on read-side renders) — this module just
// exposes the pure call.

import { z } from "zod";
import type { LLMProvider } from "@learnpro/llm";
import { ANTHROPIC_HAIKU } from "@learnpro/llm";
import {
  WEEKLY_THEME_PROMPT_VERSION,
  buildWeeklyThemeSystemPrompt,
  buildWeeklyThemeUserPrompt,
  type WeeklyThemePromptConcept,
} from "@learnpro/prompts";

export interface ConceptInfo {
  slug: string;
  name: string;
  tags?: ReadonlyArray<string>;
}

export interface GenerateWeeklyThemeInput {
  llm: LLMProvider;
  concepts: ReadonlyArray<ConceptInfo>;
  target_role?: string | null;
  user_id?: string;
  // Override the default Haiku model — used by tests + future operator tuning.
  model?: string;
}

export interface GenerateWeeklyThemeOutput {
  theme: string;
}

// Theme constraints — enforced at parse time so a model that drifts from the prompt is
// rejected instead of silently shipping bad copy. The route falls back to the concept
// name on null.
const MAX_WORDS = 8;
const MAX_CHARS = 80;

// Coach-voice forbidden substrings. Matches the rest of the user-visible-copy enforcement
// across notifications / dashboard / today-plan / weekly-plan. Each is checked
// case-insensitively against the model's `theme` field.
//
// Important: these are checked against the *output* — the prompt itself may legally name
// a forbidden phrase as a counter-example. The list intentionally errs on the side of
// rejecting borderline marketing copy ("crush", "level up"); the caller falls back to the
// deterministic theme so a rejection is never a user-facing failure.
const FORBIDDEN_OUTPUT_SUBSTRINGS: ReadonlyArray<string> = [
  "don't lose",
  "lose your streak",
  "fall behind",
  "🔥",
  "⚠️",
  "leaderboard",
  "you've got this",
  "level up",
  "fomo",
  "crush",
  "beat the clock",
  "master ",
  "dominate",
  "hustle",
];

const ResponseSchema = z.object({
  theme: z.string().min(1),
});

export async function generateWeeklyTheme(
  input: GenerateWeeklyThemeInput,
): Promise<GenerateWeeklyThemeOutput | null> {
  if (input.concepts.length === 0) return null;

  const promptConcepts: WeeklyThemePromptConcept[] = input.concepts.map((c) => {
    const tags = c.tags;
    return tags !== undefined
      ? { slug: c.slug, name: c.name, tags }
      : { slug: c.slug, name: c.name };
  });

  const system = buildWeeklyThemeSystemPrompt();
  const user = buildWeeklyThemeUserPrompt({
    concepts: promptConcepts,
    target_role: input.target_role ?? null,
  });

  let res;
  try {
    res = await input.llm.complete({
      messages: [{ role: "user", content: user }],
      system,
      model: input.model ?? ANTHROPIC_HAIKU,
      role: "reflection",
      max_tokens: 80,
      temperature: 0.6,
      prompt_version: WEEKLY_THEME_PROMPT_VERSION,
      ...(input.user_id !== undefined ? { user_id: input.user_id } : {}),
    });
  } catch {
    // Best-effort — never let a transient LLM hiccup take down the weekly plan. The
    // caller falls back to the concept-name theme.
    return null;
  }

  return parseWeeklyThemeResponse(res.text);
}

// Parses the model's output and applies the coach-voice + length validators. Returns null
// on any failure so the caller can fall back. Pure function — exposed for tests.
export function parseWeeklyThemeResponse(text: string): GenerateWeeklyThemeOutput | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (stripped.length === 0) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    return null;
  }

  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) return null;

  const theme = parsed.data.theme.trim();
  if (theme.length === 0) return null;
  if (theme.length > MAX_CHARS) return null;
  if (countWords(theme) > MAX_WORDS) return null;
  if (containsForbiddenSubstring(theme)) return null;
  if (hasExclamation(theme)) return null;
  if (isAllCapsImperative(theme)) return null;

  return { theme };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

function containsForbiddenSubstring(text: string): boolean {
  const lowered = text.toLowerCase();
  for (const phrase of FORBIDDEN_OUTPUT_SUBSTRINGS) {
    if (lowered.includes(phrase)) return true;
  }
  return false;
}

function hasExclamation(text: string): boolean {
  return text.includes("!");
}

// Rejects "BURN IT" / "GET HASH MAPS" — short messages where every alpha char is uppercase
// AND there are at least two words. Allows "Reading the room with hash maps" (mixed case)
// and "API basics" (acronym in mixed-case context).
function isAllCapsImperative(text: string): boolean {
  const alphaOnly = text.replace(/[^a-zA-Z]/g, "");
  if (alphaOnly.length === 0) return false;
  const allUpper = alphaOnly === alphaOnly.toUpperCase();
  if (!allUpper) return false;
  // Single-word all-caps acronyms ("API") are fine.
  return countWords(text) >= 2;
}

// Re-export the constants so tests + callers can reference them without re-deriving the
// rules.
export const WEEKLY_THEME_MAX_WORDS = MAX_WORDS;
export const WEEKLY_THEME_MAX_CHARS = MAX_CHARS;
export const WEEKLY_THEME_FORBIDDEN_OUTPUT_SUBSTRINGS = FORBIDDEN_OUTPUT_SUBSTRINGS;
