import { describe, expect, it } from "vitest";
import { loadProblems } from "@learnpro/problems";
import { loadTrack, TYPESCRIPT_FUNDAMENTALS_PATH } from "./loader.js";
import { ConceptSlugSchema } from "./schema.js";

describe("loadTrack — typescript-fundamentals.yaml", () => {
  const track = loadTrack(TYPESCRIPT_FUNDAMENTALS_PATH);

  it("declares language typescript", () => {
    expect(track.language).toBe("typescript");
  });

  it("uses the typescript-fundamentals slug", () => {
    expect(track.slug).toBe("typescript-fundamentals");
  });

  it("has the expected ordered concept count", () => {
    // Spec lists 13 target concepts; the seed bank from STORY-016 covers 12 of
    // them today. `modules` is deferred until at least one TS problem in the
    // bank exercises module syntax — see the Story footnote.
    expect(track.ordered_concepts.length).toBe(12);
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

  it("every seed_problem_slug matches a real problem in the typescript bank", () => {
    const tsSlugs = new Set(
      loadProblems()
        .filter((p) => p.language === "typescript")
        .map((p) => p.slug),
    );
    for (const c of track.ordered_concepts) {
      for (const slug of c.seed_problem_slugs) {
        expect(tsSlugs.has(slug), `concept ${c.slug} -> missing problem ${slug}`).toBe(true);
      }
    }
  });

  it("every concept summary is non-trivial", () => {
    for (const c of track.ordered_concepts) {
      expect(c.summary.length, `concept ${c.slug} summary too short`).toBeGreaterThanOrEqual(40);
    }
  });

  it("does not reference modules until the seed bank gains coverage", () => {
    // Sentinel: if a future commit adds a `modules` concept here, somebody must
    // have shipped at least one TS problem tagged with module syntax — update
    // both at the same time, otherwise the orphan-ref invariant will fire.
    const slugs = new Set(track.ordered_concepts.map((c) => c.slug));
    expect(slugs.has("modules")).toBe(false);
  });
});
