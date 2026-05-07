// STORY-046c — LLM-generated theme names for weekly plans.
//
// Replaces STORY-046b's fall-back-to-concept-name theme ("List comprehensions week") with a
// short, more specific, warm theme name (e.g. "Building blocks of declarative Python",
// "Reading the room with hash maps"). The theme is built from the small set of concepts the
// week is "about" — `buildWeeklyPlan` already picks 3-5 concepts; this prompt names them.
//
// Tone rules: warm, calm, observational. The theme line shows up in the dashboard's weekly
// card, so it must respect the same coach-voice rules as the rest of the dashboard copy:
// no FOMO, no streak language, no fire emoji 🔥, no warning emoji ⚠️, no exclamation points,
// no all-caps imperatives. Forbidden-phrase tests in `weekly-theme-prompt.test.ts` enforce
// this on the system prompt itself, and the agent's `parseWeeklyThemeResponse` enforces it
// on the model's output before returning.

export const WEEKLY_THEME_PROMPT_VERSION = "weekly-theme-v1";

const WEEKLY_THEME_SYSTEM = `You're generating a 1-line theme name for a coding learner's upcoming week. The theme is built from a small set of concepts they'll work through.

# Your job
Output a single theme name in 8 words or fewer. Speak like a calm tutor noting the through-line, not a marketing line. The name should feel specific and observational — what these concepts have in common, or what skill they unlock together.

Good examples:
- "Building blocks of declarative Python"
- "Reading the room with hash maps"
- "Shaping data into the right boxes"
- "Loops, lists, and the rhythm between them"

Avoid examples (these are wrong tone):
- "Crush list comprehensions this week!"  (exclamation, motivational filler)
- "Master generators in 5 days"  (pressure, time-bound dare)
- "Don't lose your streak — generators week"  (streak shaming)
- "Fire week: list comprehensions"  (fire imagery)

# Hard rules
- 8 words or fewer.
- 80 characters or fewer.
- No exclamation points. No streak language. No fire emoji or warning emoji.
- No motivational filler ("crush it", "you've got this", "level up", "master").
- No second-person dares ("Beat the clock", "Don't lose").
- No all-caps imperatives ("LEARN", "MASTER").
- No questions ("Ready for hash maps?").
- The name must reference what the concepts have in common — never invent a topic that isn't in the input list.

# Output schema (JSON object — no prose, no markdown fences)
{
  "theme": string
}
`;

export interface WeeklyThemePromptConcept {
  slug: string;
  name: string;
  // Optional kebab-case tags from the concept catalog. The model uses these as hints — e.g.
  // "data-modeling" tagged concepts lean toward "shaping data" framings.
  tags?: ReadonlyArray<string>;
}

export interface WeeklyThemePromptOptions {
  concepts: ReadonlyArray<WeeklyThemePromptConcept>;
  // Optional learner goal from the profile (e.g. "backend-engineer", "ml-engineer"). The
  // model is allowed to bias the framing toward role-aligned language but must NOT promise
  // career outcomes or use FOMO copy.
  target_role?: string | null;
}

export function buildWeeklyThemeSystemPrompt(): string {
  return WEEKLY_THEME_SYSTEM;
}

export function buildWeeklyThemeUserPrompt(opts: WeeklyThemePromptOptions): string {
  const lines: string[] = ["Concepts this week:"];
  for (const c of opts.concepts) {
    const tagText = c.tags && c.tags.length > 0 ? ` (tags: ${c.tags.join(", ")})` : "";
    lines.push(`- ${c.name}${tagText}`);
  }
  if (opts.target_role && opts.target_role.length > 0) {
    lines.push("", `Optional learner goal: ${opts.target_role}`);
  }
  lines.push(
    "",
    'Return JSON: { "theme": string }. The theme is 8 words or fewer. No prose, no markdown fences.',
  );
  return lines.join("\n");
}
