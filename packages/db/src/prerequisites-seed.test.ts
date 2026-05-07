import { describe, expect, it } from "vitest";
import {
  CONCEPTS_YAML_ROOT,
  loadConceptsFromYaml,
} from "./concepts-seed.js";
import {
  PREREQUISITES_YAML_PATH,
  loadPrerequisitesFromYaml,
} from "./prerequisites-seed.js";
import { detectCycles, walkConceptGraph, topologicalOrder } from "./concept-graph.js";

const conceptsCache = (() => {
  const all = loadConceptsFromYaml({ rootDir: CONCEPTS_YAML_ROOT });
  return { all, slugs: new Set(all.map((c) => c.slug)) };
})();

describe("prerequisites-seed: knowledge graph integrity", () => {
  it("loads at least 400 prerequisite edges", () => {
    const edges = loadPrerequisitesFromYaml({
      yamlPath: PREREQUISITES_YAML_PATH,
      knownConceptSlugs: conceptsCache.slugs,
    });
    expect(edges.length).toBeGreaterThanOrEqual(400);
  });

  it("every edge endpoint is a known concept slug", () => {
    const edges = loadPrerequisitesFromYaml({
      yamlPath: PREREQUISITES_YAML_PATH,
      knownConceptSlugs: conceptsCache.slugs,
    });
    for (const e of edges) {
      expect(conceptsCache.slugs.has(e.from)).toBe(true);
      expect(conceptsCache.slugs.has(e.to)).toBe(true);
      expect(e.from).not.toBe(e.to);
    }
  });

  it("the full graph has no cycles (CI gate)", () => {
    const edges = loadPrerequisitesFromYaml({
      yamlPath: PREREQUISITES_YAML_PATH,
      knownConceptSlugs: conceptsCache.slugs,
    });
    const result = detectCycles([...conceptsCache.slugs], edges);
    if (result.hasCycle) {
      throw new Error(
        `cycle in production knowledge graph: ${result.cycle?.join(" -> ")}`,
      );
    }
    expect(result.hasCycle).toBe(false);
  });

  it("topological order linearises every concept (no orphan from cycle escape)", () => {
    const edges = loadPrerequisitesFromYaml({
      yamlPath: PREREQUISITES_YAML_PATH,
      knownConceptSlugs: conceptsCache.slugs,
    });
    const order = topologicalOrder([...conceptsCache.slugs], edges);
    expect(order.length).toBe(conceptsCache.slugs.size);
    expect(new Set(order).size).toBe(order.length);
  });

  it("AC #4: variables -> metaclasses walk produces a sane order", () => {
    const edges = loadPrerequisitesFromYaml({
      yamlPath: PREREQUISITES_YAML_PATH,
      knownConceptSlugs: conceptsCache.slugs,
    });
    // The walker follows `from -> to` edges (advanced -> basics in the
    // depends-on direction). To go FROM an advanced concept BACK to
    // basics, we walk the natural edge direction.
    const path = walkConceptGraph(
      "python.advanced.metaclasses",
      "python.basics.variables",
      edges,
    );
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toBe("python.advanced.metaclasses");
    expect(path.at(-1)).toBe("python.basics.variables");
    // Sanity: the walk should pass through classes (they are between).
    expect(path).toContain("python.basics.classes");
  });

  it("walks react.basics.effects -> typescript.basics.functions", () => {
    const edges = loadPrerequisitesFromYaml({
      yamlPath: PREREQUISITES_YAML_PATH,
      knownConceptSlugs: conceptsCache.slugs,
    });
    const path = walkConceptGraph(
      "react.basics.effects",
      "typescript.basics.functions",
      edges,
    );
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toBe("react.basics.effects");
    expect(path.at(-1)).toBe("typescript.basics.functions");
  });

  it("walks dsa.dijkstra -> dsa.arrays", () => {
    const edges = loadPrerequisitesFromYaml({
      yamlPath: PREREQUISITES_YAML_PATH,
      knownConceptSlugs: conceptsCache.slugs,
    });
    const path = walkConceptGraph("dsa.dijkstra", "dsa.arrays", edges);
    expect(path.length).toBeGreaterThan(1);
    expect(path[0]).toBe("dsa.dijkstra");
    expect(path.at(-1)).toBe("dsa.arrays");
  });

  it("rejects a yaml that introduces a cycle", () => {
    const cycleSlugs = new Set([
      "a.x",
      "b.x",
    ]);
    expect(() =>
      loadPrerequisitesFromYaml({
        yamlPath: PREREQUISITES_YAML_PATH,
        knownConceptSlugs: cycleSlugs,
      }),
    ).toThrow();
  });

  it("rejects an unknown 'from' slug", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "prereq-bad-"));
    const file = path.join(dir, "p.yaml");
    writeFileSync(
      file,
      `prerequisites:\n  - from: ghost.x\n    to: real.y\n`,
    );
    expect(() =>
      loadPrerequisitesFromYaml({
        yamlPath: file,
        knownConceptSlugs: new Set(["real.y"]),
      }),
    ).toThrow(/unknown 'from' slug/);
  });

  it("rejects an unknown 'to' slug", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "prereq-bad-"));
    const file = path.join(dir, "p.yaml");
    writeFileSync(
      file,
      `prerequisites:\n  - from: real.x\n    to: ghost.y\n`,
    );
    expect(() =>
      loadPrerequisitesFromYaml({
        yamlPath: file,
        knownConceptSlugs: new Set(["real.x"]),
      }),
    ).toThrow(/unknown 'to' slug/);
  });

  it("rejects a self-edge", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "prereq-self-"));
    const file = path.join(dir, "p.yaml");
    writeFileSync(file, `prerequisites:\n  - from: real.x\n    to: real.x\n`);
    expect(() =>
      loadPrerequisitesFromYaml({
        yamlPath: file,
        knownConceptSlugs: new Set(["real.x"]),
      }),
    ).toThrow(/self-edge/);
  });

  it("rejects duplicate edges within a single yaml", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "prereq-dup-"));
    const file = path.join(dir, "p.yaml");
    writeFileSync(
      file,
      `prerequisites:\n  - { from: a.x, to: b.y }\n  - { from: a.x, to: b.y }\n`,
    );
    expect(() =>
      loadPrerequisitesFromYaml({
        yamlPath: file,
        knownConceptSlugs: new Set(["a.x", "b.y"]),
      }),
    ).toThrow(/duplicate edge/);
  });

  it("detects a cycle if the yaml is malformed (deliberate fixture)", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "prereq-cycle-"));
    const file = path.join(dir, "p.yaml");
    writeFileSync(
      file,
      `prerequisites:\n  - { from: a.x, to: b.y }\n  - { from: b.y, to: c.z }\n  - { from: c.z, to: a.x }\n`,
    );
    expect(() =>
      loadPrerequisitesFromYaml({
        yamlPath: file,
        knownConceptSlugs: new Set(["a.x", "b.y", "c.z"]),
      }),
    ).toThrow(/cycle detected/);
  });
});
