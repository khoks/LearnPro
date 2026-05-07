// STORY-038 — comprehension tutor commentary.
//
// After a comprehension submission, the tutor surfaces a short, coach-voice prose paragraph that
// (a) acknowledges the verdict, and (b) explains the *why* using the problem's authored
// `explanation` field. Coach-voice rules: warm but not coercive, never accusatory, never
// shouting. The forbidden-phrase check below mirrors the one in
// `apps/web/src/app/session/comprehension-panel.test.tsx`.
//
// Why the commentary lives in @learnpro/agent (and not in @learnpro/web): the API surface that
// returns commentary may eventually power email digests / push body / WhatsApp nudges. Keeping
// the prose generation in the agent package keeps it framework-agnostic and reusable.

const FORBIDDEN_PHRASES: ReadonlyArray<RegExp> = [
  /DON'?T LOSE/i,
  /\bDAY\s+\d+\b/,
  /🔥/,
  /⚠️/,
  /\bHURRY\b/i,
  /\bMUST\s+/,
  /leaderboard/i,
];

export interface ComprehensionCommentaryInput {
  correct: boolean;
  explanation: string;
  // Free-text only: the grader's per-submission reasoning sentence. Ignored on correct answers.
  grader_reasoning?: string;
  fallback_used?: boolean;
}

export interface ComprehensionCommentary {
  headline: string;
  body: string;
}

export function buildComprehensionCommentary(
  input: ComprehensionCommentaryInput,
): ComprehensionCommentary {
  if (input.correct) {
    return {
      headline: "Nice — that one is right.",
      body: `Here is why: ${input.explanation.trim()}`,
    };
  }
  const graderLine = input.grader_reasoning?.trim();
  const bodyParts: string[] = [];
  if (graderLine && graderLine.length > 0 && !input.fallback_used) {
    bodyParts.push(graderLine);
  }
  bodyParts.push(`What good looks like: ${input.explanation.trim()}`);
  return {
    headline: "Not quite — let's walk through it.",
    body: bodyParts.join(" "),
  };
}

// Test-helper export: the regex list backing the forbidden-phrase check. Tests reuse this list
// via `forbiddenPhrasesForCommentary()` to keep the source-of-truth in one place.
export function forbiddenPhrasesForCommentary(): ReadonlyArray<RegExp> {
  return FORBIDDEN_PHRASES;
}
