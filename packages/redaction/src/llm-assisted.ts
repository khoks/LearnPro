import { z } from "zod";
import { ANTHROPIC_HAIKU, type LLMProvider } from "@learnpro/llm";
import type {
  LlmAssistedRedactor,
  RedactionResult,
  RedactionScrubbedEntry,
  RedactionType,
} from "@learnpro/shared";

// STORY-056 — Haiku-backed second-pass redactor. Asks the model to flag PII the regex missed
// (names tied to email contexts, addresses, full-name + city combos, etc.). Schema is tight so
// we can drop on any parse failure rather than trust prose.

const REDACTION_SYSTEM_PROMPT = `You are a privacy reviewer. You receive a chunk of free text and a JSON list of \
PII categories the regex pass already flagged. Your job: scan the text for PII the regex \
missed. PII includes: full personal names paired with identifying context (city, school, \
employer), street addresses, dates of birth, IBAN / SWIFT / routing / account numbers, and \
medical/health identifiers. Return ONLY a JSON object with this shape:
{
  "additional_redactions": [
    { "type": "email" | "phone" | "url" | "credit_card" | "gov_id" | "name" | "address" | "other", "span_start": <int>, "span_end": <int> }
  ]
}
- span_start and span_end are character offsets into the text (0-based, end exclusive).
- If you find no additional PII, return { "additional_redactions": [] }.
- Be conservative — false positives are tolerable; do NOT flag generic words.
- Do not include any explanation, markdown, or commentary.`;

const AdditionalRedactionSchema = z.object({
  type: z.enum(["email", "phone", "url", "credit_card", "gov_id", "name", "address", "other"]),
  span_start: z.number().int().nonnegative(),
  span_end: z.number().int().positive(),
});

const ReviewResponseSchema = z.object({
  additional_redactions: z.array(AdditionalRedactionSchema),
});

export interface HaikuRedactorOptions {
  llm: LLMProvider;
  // The LLM model id. Defaults to ANTHROPIC_HAIKU; tests can override.
  model?: string;
  // Logger for soft-failures (parse errors / LLM throws). Defaults to console.warn.
  logger?: (msg: string, err: unknown) => void;
  // Optional user_id to stamp on the LLM telemetry row.
  user_id_for_telemetry?: string;
}

export class HaikuLlmAssistedRedactor implements LlmAssistedRedactor {
  private readonly llm: LLMProvider;
  private readonly model: string;
  private readonly logger: (msg: string, err: unknown) => void;
  private readonly userId: string | undefined;

  constructor(opts: HaikuRedactorOptions) {
    this.llm = opts.llm;
    this.model = opts.model ?? ANTHROPIC_HAIKU;
    this.logger = opts.logger ?? defaultLogger;
    this.userId = opts.user_id_for_telemetry;
  }

  async review(text: string, regexResult: RedactionResult): Promise<RedactionResult> {
    let llmResponse: string;
    try {
      const userPrompt = buildUserPrompt(text, regexResult);
      const completeArgs: Parameters<LLMProvider["complete"]>[0] = {
        messages: [{ role: "user", content: userPrompt }],
        system: REDACTION_SYSTEM_PROMPT,
        model: this.model,
        max_tokens: 400,
        temperature: 0,
        role: "reflection",
      };
      if (this.userId !== undefined) completeArgs.user_id = this.userId;
      const res = await this.llm.complete(completeArgs);
      llmResponse = res.text;
    } catch (err) {
      this.logger("[redaction] llm review failed — falling back to regex result", err);
      return regexResult;
    }

    const parsed = parseReviewResponse(llmResponse);
    if (!parsed) {
      this.logger("[redaction] llm review unparseable — falling back to regex result", llmResponse);
      return regexResult;
    }

    return mergeAdditionalRedactions(text, regexResult, parsed.additional_redactions);
  }
}

function defaultLogger(msg: string, err: unknown): void {
  console.warn(msg, err);
}

function buildUserPrompt(text: string, regexResult: RedactionResult): string {
  const summary = regexResult.scrubbed.map((e) => `${e.type}:${e.count}`).join(", ");
  return `Regex already flagged: ${summary || "(none)"}\n\nTEXT:\n${text}`;
}

function parseReviewResponse(raw: string): z.infer<typeof ReviewResponseSchema> | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(stripped);
  } catch {
    return null;
  }
  const result = ReviewResponseSchema.safeParse(json);
  return result.success ? result.data : null;
}

// Apply LLM-found additions on top of the regex result. Skips spans that overlap an existing
// `[REDACTED:...]` placeholder — the regex pass already covered that byte range. Spans that
// fall outside the text bounds are dropped silently (LLM hallucination).
function mergeAdditionalRedactions(
  originalText: string,
  regexResult: RedactionResult,
  additions: { type: string; span_start: number; span_end: number }[],
): RedactionResult {
  if (additions.length === 0) return regexResult;

  const validAdditions = additions
    .filter(
      (a) => a.span_start >= 0 && a.span_end <= originalText.length && a.span_start < a.span_end,
    )
    .sort((a, b) => a.span_start - b.span_start);
  if (validAdditions.length === 0) return regexResult;

  // Build a fresh redacted string from the original text, blending regex + LLM spans. The regex
  // result was generated from the same source text, so we re-derive scrub spans from it. Because
  // the regex output uses fixed `[REDACTED:type]` markers, we walk both the regex-redacted text
  // and the original text in parallel to recover original byte ranges.
  const regexSpans = recoverRegexSpans(originalText, regexResult.redacted);
  const allSpans = [...regexSpans];
  for (const a of validAdditions) {
    const overlaps = allSpans.some((s) => !(a.span_end <= s.start || a.span_start >= s.end));
    if (overlaps) continue;
    allSpans.push({
      start: a.span_start,
      end: a.span_end,
      type: normalizeAdditionalType(a.type),
    });
  }

  allSpans.sort((a, b) => a.start - b.start);

  let out = "";
  let cursor = 0;
  const counts = new Map<string, number>();
  for (const span of allSpans) {
    if (span.start < cursor) continue;
    out += originalText.slice(cursor, span.start);
    out += `[REDACTED:${span.type}]`;
    counts.set(span.type, (counts.get(span.type) ?? 0) + 1);
    cursor = span.end;
  }
  out += originalText.slice(cursor);

  const scrubbed: RedactionScrubbedEntry[] = [];
  for (const [type, count] of counts) {
    scrubbed.push({ type: typeAsRedactionType(type), count });
  }
  scrubbed.sort((a, b) => a.type.localeCompare(b.type));

  return { redacted: out, scrubbed };
}

interface RecoveredSpan {
  start: number;
  end: number;
  type: string;
}

const REDACTED_PLACEHOLDER_RE = /\[REDACTED:([a-z_]+)\]/g;

// Recovers original-text spans for each `[REDACTED:type]` placeholder in the regex output.
// Walks the placeholder string + the original in lock-step, anchoring on every placeholder.
function recoverRegexSpans(originalText: string, redactedText: string): RecoveredSpan[] {
  const out: RecoveredSpan[] = [];
  let origCursor = 0;
  let redCursor = 0;
  const placeholders = [...redactedText.matchAll(REDACTED_PLACEHOLDER_RE)];
  for (const ph of placeholders) {
    const phStart = ph.index ?? 0;
    const between = redactedText.slice(redCursor, phStart);
    // Advance origCursor by the literal `between` segment (it appears verbatim in the original).
    const matchInOrig = originalText.indexOf(between, origCursor);
    if (matchInOrig === -1) {
      // Defensive: if recovery fails, return what we have — orchestration tolerates an empty list.
      return out;
    }
    const placeholderOrigStart = matchInOrig + between.length;
    const type = ph[1] ?? "other";
    // We don't know the exact end offset in the original — the placeholder replaced a span of
    // unknown length. The next placeholder's anchor will tell us where the previous span ended.
    out.push({ start: placeholderOrigStart, end: placeholderOrigStart, type });
    origCursor = placeholderOrigStart;
    redCursor = phStart + ph[0].length;
  }
  // Second pass: derive each span's `end` by anchoring on the next placeholder's start, or on
  // the trailing literal segment.
  for (let i = 0; i < out.length; i++) {
    const span = out[i]!;
    const nextRedStart =
      i + 1 < placeholders.length ? (placeholders[i + 1]?.index ?? 0) : redactedText.length;
    const nextLiteral = redactedText.slice(
      (placeholders[i]?.index ?? 0) + (placeholders[i]?.[0].length ?? 0),
      nextRedStart,
    );
    if (nextLiteral.length === 0) {
      // The next placeholder follows immediately; we can't pinpoint the end without the
      // original-source pattern. Use a 1-char minimum so overlap checks still work.
      span.end = span.start + 1;
    } else {
      const nextOrigIdx = originalText.indexOf(nextLiteral, span.start);
      span.end = nextOrigIdx === -1 ? span.start + 1 : nextOrigIdx;
    }
  }
  return out;
}

function normalizeAdditionalType(t: string): string {
  if (t === "email" || t === "phone" || t === "url" || t === "credit_card" || t === "gov_id") {
    return t;
  }
  if (t === "name") return "name";
  if (t === "address") return "address";
  return "other";
}

function typeAsRedactionType(t: string): RedactionType {
  if (t === "email" || t === "phone" || t === "url" || t === "credit_card" || t === "gov_id") {
    return t;
  }
  // Surface name/address/other under gov_id type label so existing consumers don't have to know
  // about new categories. The replacement string still carries the precise label (e.g.
  // `[REDACTED:address]`); only the count summary loses fidelity.
  return "gov_id";
}
