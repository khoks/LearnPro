import { describe, expect, it } from "vitest";
import {
  BUG_ARCHETYPE_LABELS,
  BUG_FINDING_BAND_THRESHOLDS,
  bugFindingBand,
  humanizeBugArchetype,
} from "./bug-finding-band.js";

describe("bugFindingBand — STORY-037b band mapping", () => {
  it("returns 'still learning' for scores below 0.4", () => {
    expect(bugFindingBand(0)).toBe("still learning");
    expect(bugFindingBand(0.1)).toBe("still learning");
    expect(bugFindingBand(0.39)).toBe("still learning");
    expect(bugFindingBand(0.399999)).toBe("still learning");
  });

  it("returns 'getting there' for scores in [0.4, 0.7]", () => {
    // Lower boundary is inclusive.
    expect(bugFindingBand(0.4)).toBe("getting there");
    // Cold start (0.5) — untouched archetypes sit in the middle band.
    expect(bugFindingBand(0.5)).toBe("getting there");
    expect(bugFindingBand(0.6)).toBe("getting there");
    // Upper boundary is inclusive.
    expect(bugFindingBand(0.7)).toBe("getting there");
  });

  it("returns 'solid' for scores above 0.7", () => {
    expect(bugFindingBand(0.700001)).toBe("solid");
    expect(bugFindingBand(0.8)).toBe("solid");
    expect(bugFindingBand(1)).toBe("solid");
  });

  it("falls back to 'getting there' for non-finite inputs (defensive)", () => {
    expect(bugFindingBand(Number.NaN)).toBe("getting there");
    expect(bugFindingBand(Number.POSITIVE_INFINITY)).toBe("getting there");
    expect(bugFindingBand(Number.NEGATIVE_INFINITY)).toBe("getting there");
  });

  it("uses the documented threshold constants", () => {
    expect(BUG_FINDING_BAND_THRESHOLDS.still_learning_below).toBe(0.4);
    expect(BUG_FINDING_BAND_THRESHOLDS.solid_above).toBe(0.7);
  });
});

describe("humanizeBugArchetype — STORY-037b labels", () => {
  it("renders the documented humanized labels for every archetype", () => {
    expect(humanizeBugArchetype("off_by_one")).toBe("Off-by-one");
    expect(humanizeBugArchetype("mutation_in_iteration")).toBe("Mutation in iteration");
    expect(humanizeBugArchetype("reference_equality")).toBe("Reference equality");
    expect(humanizeBugArchetype("async_race")).toBe("Async race");
    expect(humanizeBugArchetype("late_binding")).toBe("Late binding");
    expect(humanizeBugArchetype("shadowing")).toBe("Shadowing");
    expect(humanizeBugArchetype("type_coercion")).toBe("Type coercion");
    expect(humanizeBugArchetype("default_arg_mutability")).toBe("Default-arg mutability");
  });

  it("covers all 8 STORY-037 bug archetypes", () => {
    // Sanity check that the label table doesn't miss an archetype. The 8 keys mirror
    // BUG_ARCHETYPES in `@learnpro/scoring`.
    expect(Object.keys(BUG_ARCHETYPE_LABELS).sort()).toEqual([
      "async_race",
      "default_arg_mutability",
      "late_binding",
      "mutation_in_iteration",
      "off_by_one",
      "reference_equality",
      "shadowing",
      "type_coercion",
    ]);
  });
});
