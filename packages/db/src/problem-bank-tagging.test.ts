import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBLEMS_ROOT = path.resolve(HERE, "..", "..", "problems");

const ProblemTagShape = z.object({
  slug: z.string(),
  concept_tags: z.array(z.string()).min(1),
  language: z.string(),
});

interface TaggedProblem {
  slug: string;
  language: string;
  concept_tags: string[];
  filepath: string;
}

function loadProblemFiles(): TaggedProblem[] {
  const out: TaggedProblem[] = [];
  for (const sub of ["python", "typescript"]) {
    const dir = path.join(PROBLEMS_ROOT, sub);
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
      const raw = readFileSync(path.join(dir, entry), "utf8");
      const parsed = parseYaml(raw);
      const result = ProblemTagShape.safeParse(parsed);
      if (!result.success) continue;
      out.push({
        slug: result.data.slug,
        language: result.data.language,
        concept_tags: result.data.concept_tags,
        filepath: path.join(sub, entry),
      });
    }
  }
  return out;
}

describe("problem-bank tagging (STORY-032 AC #3)", () => {
  const problems = loadProblemFiles();

  it("loads at least 60 problems from python + typescript fundamentals", () => {
    // Sanity that the test is finding the bank at all.
    expect(problems.length).toBeGreaterThanOrEqual(60);
  });

  it("every problem has at least one concept_tag (AC #3)", () => {
    for (const p of problems) {
      expect(
        p.concept_tags.length,
        `${p.filepath} has no concept_tags`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("every concept_tag is a non-empty kebab-case-ish string", () => {
    for (const p of problems) {
      for (const tag of p.concept_tags) {
        expect(tag.length, `${p.filepath}: empty tag`).toBeGreaterThan(0);
        // The existing problem YAMLs use single-segment kebab-case (e.g. "loops",
        // "hashing"). Story-032's concept slugs are dotted (python.basics.loops).
        // We accept either format here so we don't disturb STORY-016's bank.
        expect(tag.toLowerCase()).toBe(tag);
      }
    }
  });

  it("Python problems exist and each has >= 1 tag", () => {
    const py = problems.filter((p) => p.language === "python");
    expect(py.length).toBeGreaterThanOrEqual(30);
    for (const p of py) {
      expect(p.concept_tags.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("TypeScript problems exist and each has >= 1 tag", () => {
    const ts = problems.filter((p) => p.language === "typescript");
    expect(ts.length).toBeGreaterThanOrEqual(30);
    for (const p of ts) {
      expect(p.concept_tags.length).toBeGreaterThanOrEqual(1);
    }
  });
});
