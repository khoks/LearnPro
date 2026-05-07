// STORY-033 — Async profile-update agent. Synthesizes 1-3 cross-episode "trait" insights from
// the user's last 30 days of finished episodes. Runs out-of-band in a BullMQ worker so the
// user-facing tutor stays fast; the worker calls Haiku, parses the JSON output with Zod, and
// hands the validated insights back to the caller (which writes them to `profile_insights` via
// the db helper).
//
// Design intent (mirrors STORY-034's grade.ts):
//   - Pure function: given an LLM, recent episodes, and previous-insight texts, returns the
//     synthesized list. Doesn't talk to the DB or the queue — the caller composes that wiring.
//   - Use Haiku — cost-efficient, plenty for this kind of pattern synthesis.
//   - Zod-validate the LLM output. On parse failure, return an empty list (never block the
//     close path; the cron job logs a warning and moves on).
//   - Anti-dark-pattern: the prompt forbids accusatory framing; the output filter strips any
//     insight whose text contains a forbidden phrase (defense-in-depth).

import type { LLMProvider } from "@learnpro/llm";
import { ANTHROPIC_HAIKU } from "@learnpro/llm";
import {
  PROFILE_INSIGHTS_PROMPT_VERSION,
  PROFILE_INSIGHTS_SYSTEM_PROMPT,
  buildProfileInsightsUserPrompt,
  type ProfileInsightsEpisodeShape,
} from "@learnpro/prompts";
import { z } from "zod";

export const ProfileInsightSchema = z.object({
  text: z.string().min(1).max(500),
  concept_tags: z.array(z.string().min(1)).default([]),
  episodes_referenced: z.array(z.string().uuid()).default([]),
});
export type ProfileInsightOutput = z.infer<typeof ProfileInsightSchema>;

export const ProfileInsightsResultSchema = z.object({
  insights: z.array(ProfileInsightSchema),
});
export type ProfileInsightsResult = z.infer<typeof ProfileInsightsResultSchema>;

// Phrases that, if present in a candidate insight, get the insight dropped. These are the
// anti-dark-pattern phrases the prompt also forbids — but treating it as a hard server-side
// filter means a model drift can't slip a coercive line through. Lowercased; substring match.
const FORBIDDEN_INSIGHT_PHRASES: readonly string[] = [
  "you struggle",
  "you fail",
  "you can't",
  "don't lose",
  "lose your streak",
  "fall behind",
  "cheat",
  "dishonest",
  "lazy",
];

// Hard cap so a runaway model can't inflate the cost beyond reason.
const MAX_INSIGHTS = 3;

// AC #2 / AC #3: skip synthesis when the data is too thin. The agent's prompt also asks for an
// empty array in this case, but the caller short-circuits before paying the LLM cost when the
// window is small.
export const MIN_EPISODES_FOR_SYNTHESIS = 3;

export interface ProfileInsightsAgentInput {
  llm: LLMProvider;
  user_id: string;
  recent_episodes: ReadonlyArray<ProfileInsightsEpisodeShape>;
  // Optional — when supplied, the prompt nudges the model to vary its output relative to these.
  previous_insight_texts?: ReadonlyArray<string>;
  // Override the default Haiku model — used by tests.
  model?: string;
}

export interface ProfileInsightsAgentOutput {
  insights: ProfileInsightOutput[];
  // Number of LLM-emitted insights that were dropped by the forbidden-phrase filter.
  filtered_out: number;
  // True when the LLM output failed to parse and we fell back to an empty list. Surfaced so the
  // caller (the cron worker) can log a "synthesis_unparseable" warning.
  fallback_used: boolean;
  // Helps the caller decide whether to write the agent_calls row with `ok=false`.
  skipped_thin_data: boolean;
}

export async function runProfileInsightsAgent(
  input: ProfileInsightsAgentInput,
): Promise<ProfileInsightsAgentOutput> {
  if (input.recent_episodes.length < MIN_EPISODES_FOR_SYNTHESIS) {
    return { insights: [], filtered_out: 0, fallback_used: false, skipped_thin_data: true };
  }

  const userPrompt = buildProfileInsightsUserPrompt({
    recent_episodes: input.recent_episodes,
    ...(input.previous_insight_texts && input.previous_insight_texts.length > 0
      ? { previous_insight_texts: input.previous_insight_texts }
      : {}),
  });

  const res = await input.llm.complete({
    messages: [{ role: "user", content: userPrompt }],
    system: PROFILE_INSIGHTS_SYSTEM_PROMPT,
    model: input.model ?? ANTHROPIC_HAIKU,
    role: "reflection",
    max_tokens: 600,
    temperature: 0.3,
    prompt_version: PROFILE_INSIGHTS_PROMPT_VERSION,
    user_id: input.user_id,
  });

  const parsed = parseInsightsResponse(res.text);
  if (!parsed) {
    return { insights: [], filtered_out: 0, fallback_used: true, skipped_thin_data: false };
  }

  const validEpisodeIds = new Set(input.recent_episodes.map((e) => e.episode_id));
  const validConceptTags = collectConceptTagsFromEpisodes(input.recent_episodes);

  const cleaned: ProfileInsightOutput[] = [];
  let filtered_out = 0;
  for (const cand of parsed.insights) {
    const text = cand.text.trim();
    if (text.length === 0) {
      filtered_out += 1;
      continue;
    }
    if (containsForbiddenPhrase(text)) {
      filtered_out += 1;
      continue;
    }
    cleaned.push({
      text,
      // Drop concept tags the synthesis invented (must be a subset of the input episodes' tags).
      concept_tags: cand.concept_tags.filter((t) => validConceptTags.has(t)),
      // Drop episode_ids the synthesis hallucinated.
      episodes_referenced: cand.episodes_referenced.filter((id) => validEpisodeIds.has(id)),
    });
    if (cleaned.length >= MAX_INSIGHTS) break;
  }

  return {
    insights: cleaned,
    filtered_out,
    fallback_used: false,
    skipped_thin_data: false,
  };
}

// Lenient parser: strips fenced blocks, accepts the wrapped `{ insights: [...] }` shape, returns
// null when the shape is hopelessly off so the caller can log + drop.
export function parseInsightsResponse(text: string): ProfileInsightsResult | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  // Accept both `{ insights: [...] }` and a bare `[...]` (some models flatten the wrapper).
  if (Array.isArray((raw as { insights?: unknown }).insights)) {
    const result = ProfileInsightsResultSchema.safeParse(raw);
    if (result.success) return result.data;
    return null;
  }
  return null;
}

export function containsForbiddenPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN_INSIGHT_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  return false;
}

function collectConceptTagsFromEpisodes(
  episodes: ReadonlyArray<ProfileInsightsEpisodeShape>,
): Set<string> {
  const out = new Set<string>();
  for (const e of episodes) {
    for (const t of e.concept_tags) {
      out.add(t);
    }
  }
  return out;
}

// STORY-033 — telemetry helper for AC #5. Heuristic substring matcher: given an opener (the
// tutor's assign-problem response text) and the list of insights surfaced into its prompt,
// return the ids of insights whose `text` is referenced. The match is loose:
//
//   - Lowercased substring match.
//   - Strip backticks + double quotes so "for" still matches when the opener says \`for\`.
//   - To avoid false positives on tiny words ("a", "the"), require the insight text to be
//     at least MIN_MATCH_LEN characters.
//   - Try a 6-word substring of the insight (the most distinctive prefix) too — covers the
//     common case where the tutor paraphrases instead of quoting verbatim.
//
// Best-effort: a missed reference just means we don't bump that row's counter; a false
// positive bumps a row by 1, which is harmless. The dashboard's avg_referenced_count_per_insight
// telemetry tolerates small noise.
const MIN_MATCH_LEN = 12;
const PARAPHRASE_PREFIX_WORDS = 6;

export function detectReferencedInsightIds(
  opener_text: string,
  insights: ReadonlyArray<{ id: string; text: string }>,
): string[] {
  const opener = normalizeForMatch(opener_text);
  const out: string[] = [];
  for (const insight of insights) {
    const candidate = normalizeForMatch(insight.text);
    if (candidate.length < MIN_MATCH_LEN) continue;
    if (opener.includes(candidate)) {
      out.push(insight.id);
      continue;
    }
    // Try the first N-word prefix as a paraphrase signal.
    const prefix = candidate.split(/\s+/).slice(0, PARAPHRASE_PREFIX_WORDS).join(" ");
    if (prefix.length >= MIN_MATCH_LEN && opener.includes(prefix)) {
      out.push(insight.id);
    }
  }
  return out;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
