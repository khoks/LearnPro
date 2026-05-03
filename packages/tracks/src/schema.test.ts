import { describe, expect, it } from "vitest";
import { ConceptCardSchema, ConceptSlugSchema, TrackSchema, TrackSlugSchema } from "./schema.js";

const VALID_CONCEPT = {
  slug: "control-flow",
  name: "Control flow",
  summary: "Branching with `if`/`elif`/`else` and looping with `for`/`while`.",
  prerequisite_concept_slugs: ["variables-and-types"],
  seed_problem_slugs: ["is-even", "fizzbuzz"],
} as const;

const VALID_TRACK = {
  slug: "python-fundamentals",
  name: "Python fundamentals",
  language: "python",
  description: "Twelve concepts that take a beginner from variables to typed code.",
  ordered_concepts: [
    {
      slug: "variables-and-types",
      name: "Variables and types",
      summary: "Naming values; ints, floats, strings, bools.",
      prerequisite_concept_slugs: [],
      seed_problem_slugs: ["sum-two-numbers"],
    },
    VALID_CONCEPT,
  ],
} as const;

describe("ConceptCardSchema", () => {
  it("parses a valid concept card", () => {
    const result = ConceptCardSchema.safeParse(VALID_CONCEPT);
    expect(result.success).toBe(true);
  });

  it("requires kebab-case slug", () => {
    const result = ConceptCardSchema.safeParse({ ...VALID_CONCEPT, slug: "Control_Flow" });
    expect(result.success).toBe(false);
  });

  it("rejects empty slug", () => {
    const result = ConceptCardSchema.safeParse({ ...VALID_CONCEPT, slug: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = ConceptCardSchema.safeParse({ ...VALID_CONCEPT, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty summary", () => {
    const result = ConceptCardSchema.safeParse({ ...VALID_CONCEPT, summary: "" });
    expect(result.success).toBe(false);
  });

  it("requires at least one seed_problem_slug", () => {
    const result = ConceptCardSchema.safeParse({ ...VALID_CONCEPT, seed_problem_slugs: [] });
    expect(result.success).toBe(false);
  });

  it("allows an empty prerequisite_concept_slugs array", () => {
    const result = ConceptCardSchema.safeParse({
      ...VALID_CONCEPT,
      prerequisite_concept_slugs: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-kebab-case prerequisite", () => {
    const result = ConceptCardSchema.safeParse({
      ...VALID_CONCEPT,
      prerequisite_concept_slugs: ["controlFlow"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-kebab-case seed_problem_slug", () => {
    const result = ConceptCardSchema.safeParse({
      ...VALID_CONCEPT,
      seed_problem_slugs: ["Is_Even"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing prerequisite_concept_slugs field", () => {
    const { prerequisite_concept_slugs: _ignored, ...rest } = VALID_CONCEPT;
    const result = ConceptCardSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("TrackSchema", () => {
  it("parses a valid track", () => {
    const result = TrackSchema.safeParse(VALID_TRACK);
    expect(result.success).toBe(true);
  });

  it("rejects unknown language", () => {
    const result = TrackSchema.safeParse({ ...VALID_TRACK, language: "rust" });
    expect(result.success).toBe(false);
  });

  it("rejects empty ordered_concepts", () => {
    const result = TrackSchema.safeParse({ ...VALID_TRACK, ordered_concepts: [] });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = TrackSchema.safeParse({ ...VALID_TRACK, description: "" });
    expect(result.success).toBe(false);
  });

  it("rejects non-kebab track slug", () => {
    const result = TrackSchema.safeParse({ ...VALID_TRACK, slug: "Python_Fundamentals" });
    expect(result.success).toBe(false);
  });
});

describe("ConceptSlugSchema", () => {
  it("accepts multi-segment kebab-case", () => {
    expect(ConceptSlugSchema.safeParse("control-flow").success).toBe(true);
  });

  it("rejects camelCase", () => {
    expect(ConceptSlugSchema.safeParse("controlFlow").success).toBe(false);
  });

  it("rejects trailing dash", () => {
    expect(ConceptSlugSchema.safeParse("control-").success).toBe(false);
  });

  it("rejects leading digit", () => {
    expect(ConceptSlugSchema.safeParse("1-flow").success).toBe(false);
  });
});

describe("TrackSlugSchema", () => {
  it("accepts kebab-case", () => {
    expect(TrackSlugSchema.safeParse("python-fundamentals").success).toBe(true);
  });

  it("rejects underscores", () => {
    expect(TrackSlugSchema.safeParse("python_fundamentals").success).toBe(false);
  });
});
