import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPO_NAME,
  README_FOOTER_BACKLINK,
  generateReadme,
  problemDirectorySlug,
  type GenerateReadmeInput,
} from "./templates.js";

// STORY-040 — pure-function tests. No fs / no fetch. The templates produce deterministic
// markdown and directory paths the GitHub client ships unchanged.

const baseProblem = {
  name: "Two Sum",
  slug: "two-sum",
  language: "python" as const,
  statement: "Given an array of integers nums and a target, return the indices of two numbers.",
  track_name: "Python fundamentals",
  track_slug: "python-fundamentals",
};

const baseSubmission = { code: "def two_sum(nums, target):\n    return [0, 1]\n" };

const baseInput: GenerateReadmeInput = {
  problem: baseProblem,
  submission: baseSubmission,
};

describe("DEFAULT_REPO_NAME", () => {
  it("is the literal 'learnpro-portfolio' string (matches schema default)", () => {
    expect(DEFAULT_REPO_NAME).toBe("learnpro-portfolio");
  });
});

describe("problemDirectorySlug", () => {
  it("joins track_slug and slug with a single '/'", () => {
    expect(problemDirectorySlug({ slug: "two-sum", track_slug: "python-fundamentals" })).toBe(
      "python-fundamentals/two-sum",
    );
  });

  it("returns the bare slug when track_slug is missing", () => {
    expect(problemDirectorySlug({ slug: "two-sum" })).toBe("two-sum");
  });

  it("trims whitespace around track_slug + slug", () => {
    expect(
      problemDirectorySlug({ slug: "  two-sum  ", track_slug: "  python-fundamentals  " }),
    ).toBe("python-fundamentals/two-sum");
  });

  it("returns the bare slug when track_slug is whitespace-only", () => {
    expect(problemDirectorySlug({ slug: "two-sum", track_slug: "   " })).toBe("two-sum");
  });

  it("throws on an empty problem slug", () => {
    expect(() => problemDirectorySlug({ slug: "" })).toThrow(/problem\.slug must be non-empty/);
  });

  it("throws on a whitespace-only problem slug", () => {
    expect(() => problemDirectorySlug({ slug: "   " })).toThrow(
      /problem\.slug must be non-empty/,
    );
  });

  it("never returns a leading or trailing slash", () => {
    const out = problemDirectorySlug({ slug: "two-sum", track_slug: "python-fundamentals" });
    expect(out.startsWith("/")).toBe(false);
    expect(out.endsWith("/")).toBe(false);
  });
});

describe("generateReadme", () => {
  it("opens with a level-1 heading carrying the problem name", () => {
    const md = generateReadme(baseInput);
    expect(md.startsWith(`# ${baseProblem.name}\n`)).toBe(true);
  });

  it("includes the track name and language label in the intro", () => {
    const md = generateReadme(baseInput);
    expect(md).toContain("From the Python fundamentals track. Solved in Python.");
  });

  it("falls back to a no-track intro when track_name is omitted", () => {
    const out = generateReadme({
      problem: { ...baseProblem, track_name: undefined, track_slug: undefined },
      submission: baseSubmission,
    });
    expect(out).not.toContain("track");
    expect(out).toContain("Solved in Python.");
  });

  it("renders the problem statement under a 'Problem statement' section", () => {
    const md = generateReadme(baseInput);
    expect(md).toMatch(/## Problem statement\n\n.*Given an array of integers/s);
  });

  it("fences the code with the python tag for python submissions", () => {
    const md = generateReadme(baseInput);
    expect(md).toContain("```python\n");
    expect(md).toContain("def two_sum(nums, target):");
  });

  it("fences the code with the typescript tag for typescript submissions", () => {
    const md = generateReadme({
      problem: { ...baseProblem, language: "typescript" },
      submission: { code: "export function twoSum() { return [0, 1]; }" },
    });
    expect(md).toContain("```typescript\n");
    expect(md).toContain("export function twoSum");
  });

  it("uses the TypeScript label in the intro for typescript submissions", () => {
    const md = generateReadme({
      problem: { ...baseProblem, language: "typescript" },
      submission: baseSubmission,
    });
    expect(md).toContain("Solved in TypeScript.");
  });

  it("includes a 'What I learned' section with a reflection placeholder", () => {
    const md = generateReadme(baseInput);
    expect(md).toContain("## What I learned");
    expect(md).toContain("Reflection placeholder");
  });

  it("does NOT include the back-link footer by default (AC #3)", () => {
    const md = generateReadme(baseInput);
    expect(md).not.toContain("learnpro.dev");
    expect(md).not.toContain(README_FOOTER_BACKLINK);
  });

  it("includes the back-link footer when include_back_link is true", () => {
    const md = generateReadme({ ...baseInput, include_back_link: true });
    expect(md).toContain(README_FOOTER_BACKLINK);
    expect(md).toContain("learnpro.dev");
  });

  it("trims trailing whitespace inside the fenced code block (no triple newline drift)", () => {
    const md = generateReadme({
      problem: baseProblem,
      submission: { code: "def two_sum():\n    return []\n\n\n" },
    });
    expect(md).toContain("def two_sum():\n    return []\n```");
  });

  it("ends with exactly one trailing newline", () => {
    const md = generateReadme(baseInput);
    expect(md.endsWith("\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });

  it("never contains coach-voice forbidden phrases (anti-dark-pattern guard)", () => {
    const md = generateReadme({ ...baseInput, include_back_link: true });
    const forbidden = ["DON'T LOSE", "DAY X", "burn", "BURN", "🔥", "⚠️"];
    for (const phrase of forbidden) {
      expect(md).not.toContain(phrase);
    }
  });
});
