// STORY-040 — README + directory-path templates for the portfolio repo. Pure helpers — no
// network, no fs, no time. Coach-voice copy: warm, factual, never urgent or shame-driven.

export const DEFAULT_REPO_NAME = "learnpro-portfolio";

// Optional footer line — gated on the include_back_link flag (AC #3 says off by default).
// We never auto-link from the user's portfolio back into LearnPro. Their repo is theirs.
export const README_FOOTER_BACKLINK =
  "Worked through this on [LearnPro](https://learnpro.dev).";

const LANGUAGE_LABELS: Record<"python" | "typescript", string> = {
  python: "Python",
  typescript: "TypeScript",
};

const LANGUAGE_FENCE_TAGS: Record<"python" | "typescript", string> = {
  python: "python",
  typescript: "typescript",
};

export interface ReadmeProblem {
  // Display name of the problem (e.g. "Two Sum").
  name: string;
  // URL-safe slug used to build the directory path (e.g. "two-sum").
  slug: string;
  language: "python" | "typescript";
  // Plaintext problem statement. Multi-paragraph is fine; the renderer preserves blank lines.
  statement: string;
  // Display name of the parent track (e.g. "Python fundamentals"). Optional — when present,
  // it shows in the intro line.
  track_name?: string;
  // URL-safe slug for the parent track (e.g. "python-fundamentals"). Used by
  // problemDirectorySlug to build the two-segment path.
  track_slug?: string;
}

export interface ReadmeSubmission {
  // The submitted code. Rendered inside a fenced code block — DO NOT pass code that contains
  // the fence-end token (` ``` ` on its own line); we don't escape it.
  code: string;
}

export interface GenerateReadmeInput {
  problem: ReadmeProblem;
  submission: ReadmeSubmission;
  // When true, append the README_FOOTER_BACKLINK line. AC #3 says off by default — the user
  // owns this repo, and we don't auto-leak the LearnPro brand into it.
  include_back_link?: boolean;
}

// Builds the directory path segment that the portfolio commit writes the README + code into.
// Two-segment when a track_slug is provided ("<track-slug>/<problem-slug>"), single-segment
// otherwise ("<problem-slug>"). Empty/whitespace-only slugs throw — we don't want a push to
// silently land at the repo root. No leading or trailing slashes.
export function problemDirectorySlug(p: Pick<ReadmeProblem, "slug" | "track_slug">): string {
  const slug = (p.slug ?? "").trim();
  if (!slug) {
    throw new Error("problemDirectorySlug: problem.slug must be non-empty");
  }
  const trackSlug = (p.track_slug ?? "").trim();
  if (trackSlug) {
    return `${trackSlug}/${slug}`;
  }
  return slug;
}

// Builds the README markdown the portfolio push writes alongside the code. Pure helper —
// callers are free to let the user edit the result before publishing (AC #4).
export function generateReadme(input: GenerateReadmeInput): string {
  const { problem, submission } = input;
  const includeBackLink = input.include_back_link ?? false;
  const langLabel = LANGUAGE_LABELS[problem.language];
  const fence = LANGUAGE_FENCE_TAGS[problem.language];

  const intro = problem.track_name
    ? `From the ${problem.track_name} track. Solved in ${langLabel}.`
    : `Solved in ${langLabel}.`;

  const lines: string[] = [];
  lines.push(`# ${problem.name}`);
  lines.push("");
  lines.push(intro);
  lines.push("");
  lines.push("## Problem statement");
  lines.push("");
  lines.push(problem.statement.trimEnd());
  lines.push("");
  lines.push("## My solution");
  lines.push("");
  lines.push("```" + fence);
  lines.push(submission.code.trimEnd());
  lines.push("```");
  lines.push("");
  lines.push("## What I learned");
  lines.push("");
  lines.push(
    "<!-- Reflection placeholder. Fill in what surprised you, what you'd do differently, " +
      "or what concept this locked in. -->",
  );

  if (includeBackLink) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(README_FOOTER_BACKLINK);
  }

  // One trailing newline so editors that strip-and-re-add-newlines don't show a diff on save.
  return lines.join("\n") + "\n";
}
