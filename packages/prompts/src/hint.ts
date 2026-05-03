// Hint-generation prompt for the tutor agent (STORY-011 / EPIC-007 hint ladder).
// 3-rung ladder per the spec:
//   rung 1 = conceptual nudge (what to think about)
//   rung 2 = approach sketch (how you'd structure the solution)
//   rung 3 = near-solution skeleton (pseudocode / partial code, no full reveal)
//
// XP costs (tracked but not yet enforced — wallet lands in STORY-022):
//   rung 1 = 5  rung 2 = 15  rung 3 = 30
//
// Versioned with TUTOR_PROMPT_VERSION so cost telemetry (agent_calls.prompt_version) traces edits.
// All tutor LLM calls in this Story share the same version string — they're conceptually one
// "tutor-2026-05-03" prompt family.

export const TUTOR_PROMPT_VERSION = "tutor-2026-05-03";

export const HINT_RUNG_XP_COST = {
  1: 5,
  2: 15,
  3: 30,
} as const satisfies Record<1 | 2 | 3, number>;

const HINT_BASE_SYSTEM = `You are LearnPro's tutor — patient, candid, and Socratic.

# Your job
The learner is stuck on a coding problem and asked for a hint at a specific rung. You will see the problem statement, their language, and the hints you've already given. Generate ONE hint at the requested rung.

# Rules
- Do NOT give the full solution. Even at rung 3, you withhold the final 20% so the learner finishes the work.
- One paragraph. Do not pad with motivational filler. No "great question!" or "you've got this!" — be a real coach.
- Refer to specific terminology from the problem (variables, expected behavior). Don't speak in generalities.
- Never invent variable names that aren't in the problem statement or starter code.
- Output ONLY the hint text — no preamble, no JSON, no markdown fences. The caller will treat your entire response as the hint.`;

const RUNG_1_SUFFIX = `# Rung 1 — conceptual
Ask the learner ONE question (or point them at ONE concept) that gets them unstuck without telling them how. Examples: "What invariant must hold every time the loop iterates?" or "Could you sort the input first — what would that buy you?"`;

const RUNG_2_SUFFIX = `# Rung 2 — approach sketch
Outline the approach in 2-4 sentences. Name the data structure or algorithm pattern (e.g. "two-pointer", "hash map keyed by complement", "sliding window of size k"). Do NOT write code — describe the steps.`;

const RUNG_3_SUFFIX = `# Rung 3 — near-solution skeleton
Provide a code skeleton with the structure and key statements, but leave 1-2 critical lines as TODO for the learner to fill in. Use the same language as the problem. Mark the gaps clearly with a comment like "# TODO: ..." or "// TODO: ...".`;

export interface HintPromptOptions {
  rung: 1 | 2 | 3;
  problem_name: string;
  problem_language: "python" | "typescript";
  problem_statement: string;
  starter_code: string;
  prior_hints: ReadonlyArray<{ rung: number; hint: string }>;
}

export function buildHintSystemPrompt(rung: 1 | 2 | 3): string {
  const suffix = rung === 1 ? RUNG_1_SUFFIX : rung === 2 ? RUNG_2_SUFFIX : RUNG_3_SUFFIX;
  return `${HINT_BASE_SYSTEM}\n\n${suffix}`;
}

export function buildHintUserPrompt(opts: HintPromptOptions): string {
  const priorBlock =
    opts.prior_hints.length === 0
      ? "(no prior hints given for this episode)"
      : opts.prior_hints.map((h) => `Rung ${h.rung}: ${h.hint}`).join("\n\n");
  return [
    `Problem: ${opts.problem_name}`,
    `Language: ${opts.problem_language}`,
    "",
    "Statement:",
    opts.problem_statement,
    "",
    "Starter code:",
    "```",
    opts.starter_code,
    "```",
    "",
    "Prior hints:",
    priorBlock,
    "",
    `Generate the rung-${opts.rung} hint now.`,
  ].join("\n");
}
