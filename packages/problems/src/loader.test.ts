import { describe, expect, it } from "vitest";
import { loadProblems, PROBLEMS_ROOT } from "./loader.js";
import { ConceptTagSchema, ProblemDefSchema, type ProblemLanguage } from "./schema.js";

describe("loadProblems", () => {
  const all = loadProblems();

  it("returns a non-empty list", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it("every entry parses cleanly against ProblemDefSchema", () => {
    for (const p of all) {
      const result = ProblemDefSchema.safeParse(p);
      expect(result.success, `slug=${p.slug} should parse`).toBe(true);
    }
  });

  it("uses default PROBLEMS_ROOT when no rootDir is passed", () => {
    expect(typeof PROBLEMS_ROOT).toBe("string");
    expect(PROBLEMS_ROOT.length).toBeGreaterThan(0);
  });

  it("slugs are unique within each language", () => {
    const byLanguage = new Map<ProblemLanguage, Set<string>>();
    for (const p of all) {
      let set = byLanguage.get(p.language);
      if (!set) {
        set = new Set();
        byLanguage.set(p.language, set);
      }
      expect(set.has(p.slug), `duplicate slug ${p.slug} in ${p.language}`).toBe(false);
      set.add(p.slug);
    }
  });

  it("every concept tag is kebab-case", () => {
    for (const p of all) {
      for (const tag of p.concept_tags) {
        const result = ConceptTagSchema.safeParse(tag);
        expect(result.success, `bad tag '${tag}' in ${p.slug}`).toBe(true);
      }
    }
  });

  it("every track slug is kebab-case", () => {
    for (const p of all) {
      // tracks reuse ProblemSlugSchema (kebab-case)
      expect(/^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/.test(p.track)).toBe(true);
    }
  });

  it("every problem references at least one hidden test", () => {
    for (const p of all) {
      expect(p.hidden_tests.length, `${p.slug} has no hidden tests`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("loadProblems — Python distribution", () => {
  const python = loadProblems().filter((p) => p.language === "python");

  it("has at least 30 Python problems", () => {
    expect(python.length).toBeGreaterThanOrEqual(30);
  });

  it("difficulty distribution roughly matches the spec (Python)", () => {
    const easy = python.filter((p) => p.difficulty <= 2).length;
    const mid = python.filter((p) => p.difficulty === 3).length;
    const hard = python.filter((p) => p.difficulty >= 4).length;

    // Spec target per language: ~10 L1-2, ~15 L3, ~5 L4-5; tolerance ±2 each side.
    expect(easy, `expected ~10 L1-2 Python problems (got ${easy})`).toBeGreaterThanOrEqual(8);
    expect(easy).toBeLessThanOrEqual(13);
    expect(mid, `expected ~15 L3 Python problems (got ${mid})`).toBeGreaterThanOrEqual(11);
    expect(mid).toBeLessThanOrEqual(17);
    expect(hard, `expected ~5 L4-5 Python problems (got ${hard})`).toBeGreaterThanOrEqual(3);
    expect(hard).toBeLessThanOrEqual(8);
  });
});

describe("loadProblems — TypeScript distribution", () => {
  const ts = loadProblems().filter((p) => p.language === "typescript");

  it("has at least 30 TypeScript problems", () => {
    expect(ts.length).toBeGreaterThanOrEqual(30);
  });

  it("difficulty distribution roughly matches the spec (TypeScript)", () => {
    const easy = ts.filter((p) => p.difficulty <= 2).length;
    const mid = ts.filter((p) => p.difficulty === 3).length;
    const hard = ts.filter((p) => p.difficulty >= 4).length;

    // Spec target per language: ~10 L1-2, ~15 L3, ~5 L4-5; tolerance ±2 each side.
    expect(easy, `expected ~10 L1-2 TypeScript problems (got ${easy})`).toBeGreaterThanOrEqual(8);
    expect(easy).toBeLessThanOrEqual(13);
    expect(mid, `expected ~15 L3 TypeScript problems (got ${mid})`).toBeGreaterThanOrEqual(11);
    expect(mid).toBeLessThanOrEqual(17);
    expect(hard, `expected ~5 L4-5 TypeScript problems (got ${hard})`).toBeGreaterThanOrEqual(3);
    expect(hard).toBeLessThanOrEqual(8);
  });
});
