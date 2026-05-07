import { describe, expect, it } from "vitest";
import {
  ConceptYamlEntrySchema,
  ConceptYamlFileSchema,
  PrerequisiteEdgeYamlSchema,
  PrerequisiteYamlFileSchema,
  detectCycles,
  topologicalOrder,
  walkConceptGraph,
} from "./concept-graph.js";

describe("concept-graph: detectCycles", () => {
  it("returns hasCycle=false for an empty graph", () => {
    expect(detectCycles([], [])).toEqual({ hasCycle: false });
  });

  it("returns hasCycle=false for a DAG (linear chain)", () => {
    const result = detectCycles(
      ["a", "b", "c"],
      [
        { from: "b", to: "a" },
        { from: "c", to: "b" },
      ],
    );
    expect(result.hasCycle).toBe(false);
  });

  it("returns hasCycle=false for a DAG (diamond)", () => {
    const result = detectCycles(
      ["a", "b", "c", "d"],
      [
        { from: "b", to: "a" },
        { from: "c", to: "a" },
        { from: "d", to: "b" },
        { from: "d", to: "c" },
      ],
    );
    expect(result.hasCycle).toBe(false);
  });

  it("detects a self-loop", () => {
    const result = detectCycles(["a"], [{ from: "a", to: "a" }]);
    expect(result.hasCycle).toBe(true);
    expect(result.cycle).toEqual(["a", "a"]);
  });

  it("detects a 2-node cycle", () => {
    const result = detectCycles(
      ["a", "b"],
      [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    );
    expect(result.hasCycle).toBe(true);
    expect(result.cycle?.[0]).toBe(result.cycle?.at(-1));
  });

  it("detects a 3-node cycle", () => {
    const result = detectCycles(
      ["a", "b", "c"],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ],
    );
    expect(result.hasCycle).toBe(true);
    expect(result.cycle?.[0]).toBe(result.cycle?.at(-1));
    expect(result.cycle?.length).toBe(4);
  });

  it("detects a cycle in a graph that also contains DAG portions", () => {
    const result = detectCycles(
      ["a", "b", "c", "d", "e"],
      [
        { from: "b", to: "a" },
        { from: "c", to: "d" },
        { from: "d", to: "e" },
        { from: "e", to: "c" },
      ],
    );
    expect(result.hasCycle).toBe(true);
  });

  it("throws if an edge references an unknown 'from' slug", () => {
    expect(() => detectCycles(["a"], [{ from: "ghost", to: "a" }])).toThrow(/unknown concept/);
  });

  it("throws if an edge references an unknown 'to' slug", () => {
    expect(() => detectCycles(["a"], [{ from: "a", to: "ghost" }])).toThrow(/unknown concept/);
  });
});

describe("concept-graph: walkConceptGraph", () => {
  it("returns [from] when from === to", () => {
    expect(walkConceptGraph("a", "a", [])).toEqual(["a"]);
  });

  it("returns [] when no path exists", () => {
    expect(
      walkConceptGraph("a", "b", [
        { from: "c", to: "d" },
      ]),
    ).toEqual([]);
  });

  it("walks a linear chain", () => {
    const path = walkConceptGraph("a", "c", [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
    expect(path).toEqual(["a", "b", "c"]);
  });

  it("walks the shortest path in a diamond (BFS, not DFS)", () => {
    const edges = [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
      { from: "b", to: "d" },
      { from: "c", to: "d" },
    ];
    const path = walkConceptGraph("a", "d", edges);
    expect(path.length).toBe(3);
    expect(path[0]).toBe("a");
    expect(path[2]).toBe("d");
  });

  it("walks variables -> metaclasses through a sane order", () => {
    const edges = [
      { from: "python.basics.variables", to: "python.basics.functions" },
      { from: "python.basics.functions", to: "python.basics.classes" },
      { from: "python.basics.classes", to: "python.advanced.metaclasses" },
    ];
    const path = walkConceptGraph(
      "python.basics.variables",
      "python.advanced.metaclasses",
      edges,
    );
    expect(path).toEqual([
      "python.basics.variables",
      "python.basics.functions",
      "python.basics.classes",
      "python.advanced.metaclasses",
    ]);
  });
});

describe("concept-graph: topologicalOrder", () => {
  it("returns prerequisites before dependents", () => {
    // a is a basic; b depends on a; c depends on b
    const order = topologicalOrder(
      ["a", "b", "c"],
      [
        { from: "b", to: "a" },
        { from: "c", to: "b" },
      ],
    );
    const idxA = order.indexOf("a");
    const idxB = order.indexOf("b");
    const idxC = order.indexOf("c");
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it("throws on a cyclic graph", () => {
    expect(() =>
      topologicalOrder(
        ["a", "b"],
        [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      ),
    ).toThrow(/cycle/);
  });
});

describe("concept-graph: schema validation", () => {
  it("ConceptYamlEntrySchema requires a non-empty name and description", () => {
    const result = ConceptYamlEntrySchema.safeParse({
      slug: "python.basics.variables",
      name: "Variables",
      description: "A variable is a name bound to a value.",
      default_difficulty: 1,
      tags: ["fundamentals"],
      track_slugs: ["python-fundamentals"],
    });
    expect(result.success).toBe(true);
  });

  it("ConceptYamlEntrySchema rejects difficulty outside 1-5", () => {
    const result = ConceptYamlEntrySchema.safeParse({
      slug: "x.y.z",
      name: "X",
      description: "A description.",
      default_difficulty: 6,
      tags: [],
      track_slugs: ["t"],
    });
    expect(result.success).toBe(false);
  });

  it("ConceptYamlEntrySchema rejects empty track_slugs", () => {
    const result = ConceptYamlEntrySchema.safeParse({
      slug: "x.y.z",
      name: "X",
      description: "A description.",
      default_difficulty: 1,
      tags: [],
      track_slugs: [],
    });
    expect(result.success).toBe(false);
  });

  it("ConceptYamlEntrySchema accepts dotted slugs", () => {
    const result = ConceptYamlEntrySchema.safeParse({
      slug: "python.advanced.async-await",
      name: "Async/Await",
      description: "Coroutine syntax.",
      default_difficulty: 4,
      tags: ["concurrency"],
      track_slugs: ["python-advanced"],
    });
    expect(result.success).toBe(true);
  });

  it("ConceptYamlEntrySchema rejects PascalCase slugs", () => {
    const result = ConceptYamlEntrySchema.safeParse({
      slug: "Python.Basics.Variables",
      name: "X",
      description: "A description.",
      default_difficulty: 1,
      tags: [],
      track_slugs: ["t"],
    });
    expect(result.success).toBe(false);
  });

  it("ConceptYamlFileSchema requires at least one concept", () => {
    expect(ConceptYamlFileSchema.safeParse({ concepts: [] }).success).toBe(false);
    expect(
      ConceptYamlFileSchema.safeParse({
        concepts: [
          {
            slug: "x",
            name: "x",
            description: "x.",
            default_difficulty: 1,
            tags: [],
            track_slugs: ["t"],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("PrerequisiteEdgeYamlSchema requires from and to", () => {
    expect(PrerequisiteEdgeYamlSchema.safeParse({ from: "a.b", to: "c.d" }).success).toBe(true);
    expect(PrerequisiteEdgeYamlSchema.safeParse({ from: "a.b" }).success).toBe(false);
  });

  it("PrerequisiteYamlFileSchema requires at least one edge", () => {
    expect(PrerequisiteYamlFileSchema.safeParse({ prerequisites: [] }).success).toBe(false);
  });
});
