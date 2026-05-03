import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProblems } from "@learnpro/problems";
import { loadTrack, PYTHON_FUNDAMENTALS_PATH } from "./loader.js";
import { ConceptSlugSchema } from "./schema.js";

describe("loadTrack — python-fundamentals.yaml", () => {
  const track = loadTrack(PYTHON_FUNDAMENTALS_PATH);

  it("declares language python", () => {
    expect(track.language).toBe("python");
  });

  it("uses the python-fundamentals slug", () => {
    expect(track.slug).toBe("python-fundamentals");
  });

  it("has the expected ordered concept count", () => {
    // Spec lists 12 target concepts; the seed bank from STORY-016 has direct
    // problem coverage for 9 of them today. file-io / modules-and-packages /
    // typing-basics are deferred until matching problems land — see the Story.
    expect(track.ordered_concepts.length).toBe(9);
  });

  it("every concept slug is kebab-case", () => {
    for (const c of track.ordered_concepts) {
      expect(ConceptSlugSchema.safeParse(c.slug).success, `bad slug ${c.slug}`).toBe(true);
    }
  });

  it("every concept slug is unique within the track", () => {
    const seen = new Set<string>();
    for (const c of track.ordered_concepts) {
      expect(seen.has(c.slug), `duplicate slug ${c.slug}`).toBe(false);
      seen.add(c.slug);
    }
  });

  it("the first concept has no prerequisites (entry point)", () => {
    expect(track.ordered_concepts[0]?.prerequisite_concept_slugs).toEqual([]);
  });

  it("every prerequisite slug references an earlier concept (no forward refs)", () => {
    const seenSoFar = new Set<string>();
    for (const c of track.ordered_concepts) {
      for (const prereq of c.prerequisite_concept_slugs) {
        expect(
          seenSoFar.has(prereq),
          `concept ${c.slug} references forward/unknown prereq ${prereq}`,
        ).toBe(true);
      }
      seenSoFar.add(c.slug);
    }
  });

  it("every concept has at least one seed_problem_slug", () => {
    for (const c of track.ordered_concepts) {
      expect(
        c.seed_problem_slugs.length,
        `concept ${c.slug} has zero problems`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("every seed_problem_slug matches a real problem in the python bank", () => {
    const pythonSlugs = new Set(
      loadProblems()
        .filter((p) => p.language === "python")
        .map((p) => p.slug),
    );
    for (const c of track.ordered_concepts) {
      for (const slug of c.seed_problem_slugs) {
        expect(pythonSlugs.has(slug), `concept ${c.slug} -> missing problem ${slug}`).toBe(true);
      }
    }
  });

  it("every concept summary is non-trivial", () => {
    for (const c of track.ordered_concepts) {
      expect(c.summary.length, `concept ${c.slug} summary too short`).toBeGreaterThanOrEqual(40);
    }
  });
});

describe("loadTrack — orphan-ref rejection", () => {
  function writeTempTrack(yaml: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), "learnpro-tracks-"));
    const file = path.join(dir, "track.yaml");
    writeFileSync(file, yaml, "utf8");
    return file;
  }

  it("rejects a track that points at a problem slug not in the bank", () => {
    const yaml = `
slug: bad-track
name: Bad track
language: python
description: Pointer to a non-existent problem.
ordered_concepts:
  - slug: variables-and-types
    name: Variables and types
    summary: A variable is a name bound to a value.
    prerequisite_concept_slugs: []
    seed_problem_slugs:
      - this-problem-does-not-exist
`;
    const file = writeTempTrack(yaml);
    expect(() =>
      loadTrack(file, { knownProblemSlugs: new Set(["sum-two-numbers", "is-even"]) }),
    ).toThrow(/this-problem-does-not-exist/);
  });

  it("rejects a track that references a forward prerequisite", () => {
    const yaml = `
slug: forward-ref-track
name: Forward ref track
language: python
description: Concept B is listed before concept A but lists A as prereq.
ordered_concepts:
  - slug: control-flow
    name: Control flow
    summary: Branching with if/elif/else.
    prerequisite_concept_slugs:
      - variables-and-types
    seed_problem_slugs:
      - is-even
  - slug: variables-and-types
    name: Variables and types
    summary: Naming values.
    prerequisite_concept_slugs: []
    seed_problem_slugs:
      - sum-two-numbers
`;
    const file = writeTempTrack(yaml);
    expect(() =>
      loadTrack(file, { knownProblemSlugs: new Set(["is-even", "sum-two-numbers"]) }),
    ).toThrow(/variables-and-types/);
  });

  it("rejects a track that declares the same concept slug twice", () => {
    const yaml = `
slug: duplicate-track
name: Duplicate track
language: python
description: Two concepts with the same slug.
ordered_concepts:
  - slug: variables-and-types
    name: Variables and types
    summary: Naming values.
    prerequisite_concept_slugs: []
    seed_problem_slugs:
      - sum-two-numbers
  - slug: variables-and-types
    name: Variables and types again
    summary: Naming values redux.
    prerequisite_concept_slugs: []
    seed_problem_slugs:
      - is-even
`;
    const file = writeTempTrack(yaml);
    expect(() =>
      loadTrack(file, { knownProblemSlugs: new Set(["sum-two-numbers", "is-even"]) }),
    ).toThrow(/more than once/);
  });

  it("rejects a malformed YAML that fails Zod parsing", () => {
    const yaml = `
slug: bad
name: Bad
language: python
description: Missing ordered_concepts.
`;
    const file = writeTempTrack(yaml);
    expect(() => loadTrack(file)).toThrow(/invalid track/);
  });
});
