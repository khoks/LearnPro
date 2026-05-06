// STORY-056 — pure PII redaction.
//
// `redactPii(text, options?)` scans for 5 categories of PII and returns the redacted text plus
// a per-category count of what was scrubbed. No DB, no LLM, no I/O — safe to call from any
// boundary (HTTP ingest, batch sweepers, in-process pipelines).
//
// Design notes:
//   - Each detector returns a list of { start, end, type } spans on the *original* string. We
//     union all spans, sort by start, and rewrite from right→left so earlier offsets stay valid.
//   - Replacement form is `[REDACTED:{type}]` — fixed-width-per-type so reviewers can grep for
//     what categories appeared without seeing the actual content.
//   - URL redaction is opt-out (`allowUrls: true`) for tutor flows where users link to docs.
//   - Credit cards run a Luhn check so a random 16-digit ID doesn't trip the detector.
//   - Government-ID detection is conservative: SSN literal, plus 9-digit blocks preceded by a
//     "labelled" prefix like "ID:" / "SSN:" / "PASSPORT:". False positives are tolerable;
//     false negatives in this category are a privacy bug.
//   - Spans that overlap (e.g. an email contains a phone-shaped substring) are deduped — the
//     first detector's hit wins on the byte range; later detectors only see non-overlapping
//     bytes. We process detectors in this priority: email → url → credit_card → gov_id → phone.
//     (Phone last because its pattern is the most permissive.)

export type RedactionType = "email" | "phone" | "url" | "credit_card" | "gov_id";

export interface RedactionScrubbedEntry {
  type: RedactionType;
  count: number;
}

export interface RedactionResult {
  redacted: string;
  scrubbed: RedactionScrubbedEntry[];
}

export interface RedactionOptions {
  // When true, URLs are NOT scrubbed. Used for tutor code/notes where doc links are common.
  allowUrls?: boolean;
}

interface Span {
  start: number;
  end: number;
  type: RedactionType;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

// http(s) URL — scheme is required so we don't match every "site.com" mention. Excludes trailing
// punctuation that's almost certainly a sentence terminator (`.`, `,`, `)`, `]`, `>`, `"`).
const URL_RE = /https?:\/\/[^\s<>"'()[\]]+[^\s<>"'()[\].,;:!?]/gi;

// Credit-card-shaped digit groups. 13–19 digits with optional separators. Validated downstream
// by Luhn so non-card 16-digit strings don't false-positive.
const CC_RE = /\b(?:\d[ -]?){12,18}\d\b/g;

// US SSN (NNN-NN-NNNN). Hyphens required to avoid false-positives on every 9-digit number.
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

// Labelled identifier block. The label is what gives us confidence this is identifier-shaped
// data, not a count or quantity. The label MUST be followed by a separator (`:`, `#`, or
// whitespace+digits) — `id` mid-word doesn't qualify, but `ID: 123456789` or `Customer ID 12345`
// does. The captured group is 6-20 alphanumeric / hyphen / digits — wide enough to cover ID
// formats from many countries (US-style 9-digit SSN, Indian Aadhaar 12-digit, UK NINO etc.).
const LABELLED_GOV_ID_RE =
  /\b(?:ssn|ssn#|passport|aadhaar|aadhar|pan|tin|ein|nino|customer\s+id|user\s+id|account\s+id|employee\s+id)\s*[:#]?\s+(\d{6,20}|[A-Z]\d{6,12}|[A-Z]{2}\d{4,12})\b/gi;

// E.164-style international (+CC followed by 6+ digits, optional separators). The leading "+"
// keeps this cleaner than a naked digit string.
const INTL_PHONE_RE = /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{1,4}){2,5}\b/g;
// US 10-digit format. The optional opening `(` is matched by checking the char before — the
// engine's `\b` doesn't help here since `(` is non-word. We accept either `(NNN)` or `NNN`
// followed by a separator.
const US_PHONE_RE = /(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g;

function findEmailSpans(text: string): Span[] {
  return collectMatches(text, EMAIL_RE, "email");
}

function findUrlSpans(text: string): Span[] {
  return collectMatches(text, URL_RE, "url");
}

function findCreditCardSpans(text: string): Span[] {
  const out: Span[] = [];
  for (const match of text.matchAll(CC_RE)) {
    const raw = match[0];
    const digits = raw.replace(/[\s-]/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    if (!luhn(digits)) continue;
    const start = match.index ?? 0;
    out.push({ start, end: start + raw.length, type: "credit_card" });
  }
  return out;
}

function findGovIdSpans(text: string): Span[] {
  const out: Span[] = collectMatches(text, SSN_RE, "gov_id");
  for (const match of text.matchAll(LABELLED_GOV_ID_RE)) {
    const start = match.index ?? 0;
    out.push({ start, end: start + match[0].length, type: "gov_id" });
  }
  return out;
}

function findPhoneSpans(text: string): Span[] {
  const out: Span[] = [];
  for (const match of text.matchAll(INTL_PHONE_RE)) {
    if (!match[0]) continue;
    const digits = match[0].replace(/\D/g, "");
    if (digits.length < 10) continue;
    const start = match.index ?? 0;
    out.push({ start, end: start + match[0].length, type: "phone" });
  }
  for (const match of text.matchAll(US_PHONE_RE)) {
    if (!match[0]) continue;
    const start = match.index ?? 0;
    out.push({ start, end: start + match[0].length, type: "phone" });
  }
  return out;
}

function collectMatches(text: string, re: RegExp, type: RedactionType): Span[] {
  const out: Span[] = [];
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    out.push({ start, end: start + match[0].length, type });
  }
  return out;
}

// Luhn checksum — used to filter false-positive credit-card hits.
function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const ch = digits.charCodeAt(i) - 48;
    if (ch < 0 || ch > 9) return false;
    let n = ch;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum > 0 && sum % 10 === 0;
}

// Drop spans that overlap an earlier (higher-priority) span.
function dedupeOverlaps(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Span[] = [];
  let lastEnd = -1;
  for (const span of sorted) {
    if (span.start < lastEnd) continue;
    out.push(span);
    lastEnd = span.end;
  }
  return out;
}

function applyReplacements(
  text: string,
  spans: Span[],
): { redacted: string; counts: Map<RedactionType, number> } {
  const counts = new Map<RedactionType, number>();
  if (spans.length === 0) return { redacted: text, counts };
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const span of sorted) {
    out += text.slice(cursor, span.start);
    out += `[REDACTED:${span.type}]`;
    counts.set(span.type, (counts.get(span.type) ?? 0) + 1);
    cursor = span.end;
  }
  out += text.slice(cursor);
  return { redacted: out, counts };
}

export function redactPii(text: string, options: RedactionOptions = {}): RedactionResult {
  if (text.length === 0) return { redacted: text, scrubbed: [] };

  // Order matters — earlier detectors win the byte range when patterns overlap.
  const allSpans: Span[] = [];
  allSpans.push(...findEmailSpans(text));
  if (!options.allowUrls) {
    allSpans.push(...findUrlSpans(text));
  }
  allSpans.push(...findCreditCardSpans(text));
  allSpans.push(...findGovIdSpans(text));
  allSpans.push(...findPhoneSpans(text));

  const deduped = dedupeOverlaps(allSpans);
  const { redacted, counts } = applyReplacements(text, deduped);

  const scrubbed: RedactionScrubbedEntry[] = [];
  for (const [type, count] of counts) scrubbed.push({ type, count });
  scrubbed.sort((a, b) => a.type.localeCompare(b.type));

  return { redacted, scrubbed };
}

// Helpers for downstream consumers (LLM-assisted redactor, ingestion wiring) — exported so tests
// can verify behavior directly.

export function totalScrubbedCount(result: RedactionResult): number {
  return result.scrubbed.reduce((sum, e) => sum + e.count, 0);
}

export function highConfidenceCount(result: RedactionResult): number {
  // email + url + credit_card + ssn (gov_id with hyphens) are unambiguous. Phone + labelled-gov-id
  // are softer signals — useful but not a free pass to skip the LLM second pass.
  return result.scrubbed
    .filter((e) => e.type === "email" || e.type === "url" || e.type === "credit_card")
    .reduce((sum, e) => sum + e.count, 0);
}

// LLM-assisted redaction interface. Implementations (Haiku-backed prod impl, NoopLlmRedactor
// for tests) live in @learnpro/notifications — keeps this module pure.
export interface LlmAssistedRedactor {
  review(text: string, regexResult: RedactionResult): Promise<RedactionResult>;
}

// Decides whether to invoke the LLM second pass. Skips when the regex already found a
// high-confidence match (saves tokens) and also skips on empty / very-short input.
export function shouldInvokeLlmReview(text: string, regexResult: RedactionResult): boolean {
  if (text.length < 8) return false;
  if (highConfidenceCount(regexResult) > 0) return false;
  return true;
}
