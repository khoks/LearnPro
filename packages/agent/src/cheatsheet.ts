// STORY-041 — personal cheatsheet auto-generation per session.
//
// `cheatsheetAgent` is a pure function: given an LLM, a small batch of recently-closed
// episodes (with their problem definitions and any user code excerpt), it builds the
// cheatsheet prompt, calls Haiku, and returns up to N validated entries. It deliberately does
// NOT depend on a sandbox or DB — it summarises after the tutor has already closed the
// episodes upstream. The route handler / cron trigger owns persistence.
//
// Design intent (per STORY-041):
//   - Cheap (~$0.05/session in LLM cost) — Haiku, ≤6 entries, capped output tokens.
//   - Fixed entry template "concept → 1-line definition → tiny code example → common gotcha"
//     enforced both in the prompt AND via Zod-validation of the LLM output.
//   - On parse failure / empty input: best-effort empty entries with `fallback_used=true`.
//     Never throw at the user — the cron trigger writes an empty cheatsheet (so the
//     /profile history still shows the date) and the UI surfaces an empty-state.

import type { LLMProvider } from "@learnpro/llm";
import { ANTHROPIC_HAIKU } from "@learnpro/llm";
import {
  CHEATSHEET_PROMPT_VERSION,
  buildCheatsheetSystemPrompt,
  buildCheatsheetUserPrompt,
  type CheatsheetEpisodeInput,
} from "@learnpro/prompts";
import { z } from "zod";

export const CheatsheetEntrySchema = z.object({
  concept: z.string().min(1).max(120),
  definition: z.string().min(1).max(400),
  code_example: z.string().min(1).max(600),
  gotcha: z.string().min(1).max(400),
});
export type CheatsheetEntry = z.infer<typeof CheatsheetEntrySchema>;

export const CheatsheetAgentResultSchema = z.object({
  entries: z.array(CheatsheetEntrySchema).max(6),
  fallback_used: z.boolean(),
});
export type CheatsheetAgentResult = z.infer<typeof CheatsheetAgentResultSchema>;

export const DEFAULT_CHEATSHEET_MAX_ENTRIES = 6;

export interface CheatsheetAgentInput {
  llm: LLMProvider;
  user_id: string;
  episodes: ReadonlyArray<CheatsheetEpisodeInput>;
  // 1..6, defaults to 6. Only effective when ≤ 6 — the prompt + parser cap higher values.
  max_entries?: number;
  // Override the default Haiku model for tests + future operator-tunable model selection.
  model?: string;
}

export async function cheatsheetAgent(input: CheatsheetAgentInput): Promise<CheatsheetAgentResult> {
  const max_entries = clampMaxEntries(input.max_entries ?? DEFAULT_CHEATSHEET_MAX_ENTRIES);

  if (input.episodes.length === 0) {
    return { entries: [], fallback_used: false };
  }

  const system = buildCheatsheetSystemPrompt();
  const user = buildCheatsheetUserPrompt({ episodes: input.episodes, max_entries });

  const res = await input.llm.complete({
    messages: [{ role: "user", content: user }],
    system,
    model: input.model ?? ANTHROPIC_HAIKU,
    role: "reflection",
    max_tokens: 1200,
    temperature: 0.3,
    prompt_version: CHEATSHEET_PROMPT_VERSION,
    user_id: input.user_id,
  });

  const parsed = parseCheatsheetResponse(res.text);
  if (parsed) {
    return {
      entries: parsed.entries.slice(0, max_entries),
      fallback_used: false,
    };
  }
  return { entries: [], fallback_used: true };
}

// Lenient parser — strips fenced blocks, accepts a top-level `entries` array, drops malformed
// individual entries rather than failing the whole batch. Returns null only when the shape is
// hopelessly off (no JSON at all).
export function parseCheatsheetResponse(text: string): { entries: CheatsheetEntry[] } | null {
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
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entriesRaw = (raw as Record<string, unknown>)["entries"];
  if (!Array.isArray(entriesRaw)) return null;
  const entries: CheatsheetEntry[] = [];
  for (const item of entriesRaw) {
    const ok = CheatsheetEntrySchema.safeParse(item);
    if (ok.success) entries.push(ok.data);
  }
  return { entries };
}

// Render the cheatsheet entries as Markdown. Pure function — used both by the cron trigger to
// seed `markdown_content` at write-time AND by the in-app preview when the user hasn't edited
// the markdown yet. Editing the markdown decouples it from the structured `entries`.
export function entriesToMarkdown(
  entries: ReadonlyArray<CheatsheetEntry>,
  opts: { title?: string; date?: Date } = {},
): string {
  const title = opts.title ?? "Personal cheatsheet";
  const date = opts.date ?? new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const lines: string[] = [`# ${title}`, "", `_Generated on ${dateStr}_`, ""];
  if (entries.length === 0) {
    lines.push("_No entries yet — this session didn't surface anything worth capturing._");
    return lines.join("\n");
  }
  for (const entry of entries) {
    lines.push(`## ${entry.concept}`);
    lines.push("");
    lines.push(entry.definition);
    lines.push("");
    lines.push("```");
    lines.push(entry.code_example);
    lines.push("```");
    lines.push("");
    lines.push(`**Gotcha:** ${entry.gotcha}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function clampMaxEntries(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CHEATSHEET_MAX_ENTRIES;
  const rounded = Math.floor(n);
  if (rounded < 1) return 1;
  if (rounded > DEFAULT_CHEATSHEET_MAX_ENTRIES) return DEFAULT_CHEATSHEET_MAX_ENTRIES;
  return rounded;
}
