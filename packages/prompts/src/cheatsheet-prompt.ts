// STORY-041 — personal-cheatsheet prompt. The cheatsheet agent runs on Haiku and produces a
// strict JSON envelope of up to 6 entries with the fixed template "Concept → 1-line definition
// → tiny code example → common gotcha". Versioned independently so future tweaks (e.g.
// language-specific phrasing) don't bump the tutor or grader prompt versions.
//
// Tone rules deliberately mirror the grader prompt: factual, third-person, no second-person
// "you" copy. The tutor is the only agent that speaks directly to the learner — the cheatsheet
// is a reference document, not a coach voice. Forbidden phrases (FOMO, fire emoji, all-caps)
// are inert here because the prompt structure forbids motivational filler entirely.

export const CHEATSHEET_PROMPT_VERSION = "cheatsheet-v1-2026-05-06";

const CHEATSHEET_SYSTEM = `You are LearnPro's cheatsheet writer. You distil a learner's session into a personal reference card they will re-read later.

# Your job
Given a small batch of recently-closed problems and the concepts the learner touched, produce up to 6 cheatsheet entries. Each entry follows the SAME fixed template:
- "concept": the topic, 1-4 words (e.g. "List comprehensions", "Dict iteration", "Off-by-one").
- "definition": one short factual sentence. NEVER more than ~25 words.
- "code_example": a tiny standalone snippet that illustrates the idea — no shell prompts, no "..." placeholders. 1-6 lines maximum.
- "gotcha": one short factual sentence describing the common mistake or edge case.

# Rules
- Up to 6 entries. Fewer is fine — quality over quantity.
- Concepts must be drawn from the session's actual problems / outcomes. Do NOT invent topics the learner didn't touch.
- Prefer concepts the learner struggled with (failed / hint-heavy episodes) over ones they breezed through.
- Code examples must match the language of the session's problems (python or typescript). If the session mixed both, pick whichever fits the concept.
- Keep entries useful as a re-read in 3 weeks: the gotcha is the highest-value field. Do not write motivational filler. Do not address the learner ("you", "your code"). Speak in third person about the concept itself.

# Output format
Respond ONLY with a JSON object matching this exact schema (no prose before or after, no markdown fences):
{
  "entries": [
    {
      "concept": string,
      "definition": string,
      "code_example": string,
      "gotcha": string
    }
  ]
}

# Examples

Session summary:
- two-sum (passed) — concepts: arrays, hash-map
- reverse-string (failed, 2 hints) — concepts: two-pointer
- fizzbuzz (passed) — concepts: control-flow

{
  "entries": [
    { "concept": "Two-pointer reversal", "definition": "Walk two indices toward each other, swapping at each step.", "code_example": "i, j = 0, len(s) - 1\\nwhile i < j:\\n    s[i], s[j] = s[j], s[i]\\n    i += 1; j -= 1", "gotcha": "Off-by-one: stop when i < j, not i <= j, or you'll re-swap the middle." },
    { "concept": "Hash-map lookup", "definition": "Trade space for time when scanning a sequence for a paired value.", "code_example": "seen = {}\\nfor i, x in enumerate(nums):\\n    if target - x in seen:\\n        return [seen[target - x], i]\\n    seen[x] = i", "gotcha": "Insert AFTER the lookup, otherwise a single-element pair can match itself." },
    { "concept": "Mod-3 vs mod-15", "definition": "FizzBuzz: check mod-15 first, since 15-divisible numbers also satisfy mod-3 and mod-5.", "code_example": "if n % 15 == 0: return 'FizzBuzz'\\nelif n % 3 == 0: return 'Fizz'\\nelif n % 5 == 0: return 'Buzz'", "gotcha": "Order matters — testing mod-3 first traps every multiple of 15." }
  ]
}

Session summary:
- (no closed episodes)

{
  "entries": []
}
`;

export interface CheatsheetEpisodeInput {
  problem_slug: string;
  problem_name: string;
  language: "python" | "typescript";
  difficulty: string;
  concept_tags: ReadonlyArray<string>;
  final_outcome: string | null;
  hints_used: number;
  // Bounded snippet of the user's submitted code for the agent to reference. Kept small so the
  // agent isn't tempted to lift the entire submission into the cheatsheet.
  user_code_excerpt?: string | null;
  problem_statement: string;
}

export interface CheatsheetPromptOptions {
  episodes: ReadonlyArray<CheatsheetEpisodeInput>;
  max_entries: number;
}

export function buildCheatsheetSystemPrompt(): string {
  return CHEATSHEET_SYSTEM;
}

export function buildCheatsheetUserPrompt(opts: CheatsheetPromptOptions): string {
  if (opts.episodes.length === 0) {
    return "Session summary:\n- (no closed episodes)\n\nProduce a JSON object with an empty `entries` array now.";
  }
  const lines: string[] = ["Session summary:"];
  for (const e of opts.episodes) {
    const tags = e.concept_tags.length > 0 ? e.concept_tags.join(", ") : "(none)";
    const outcome = e.final_outcome ?? "in_progress";
    const hint_phrase = e.hints_used > 0 ? `${e.hints_used} hint${e.hints_used === 1 ? "" : "s"}` : "no hints";
    lines.push(
      `- ${e.problem_slug} (${outcome}, ${hint_phrase}, ${e.language}, difficulty=${e.difficulty}) — concepts: ${tags}`,
    );
    if (e.problem_statement.trim().length > 0) {
      const statement = truncate(e.problem_statement, 240);
      lines.push(`  statement: ${statement}`);
    }
    if (e.user_code_excerpt && e.user_code_excerpt.trim().length > 0) {
      const excerpt = truncate(e.user_code_excerpt, 400);
      lines.push(`  code excerpt: ${excerpt}`);
    }
  }
  lines.push("");
  lines.push(
    `Produce up to ${opts.max_entries} entries now, JSON only. Pull concepts from the session above; do not invent unrelated ones.`,
  );
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
