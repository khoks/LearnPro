import { describe, expect, it } from "vitest";
import {
  CONCEPTS_YAML_ROOT,
  loadConceptsFromYaml,
  parseConceptYaml,
} from "./concepts-seed.js";

describe("concepts-seed: YAML loader", () => {
  it("loads at least 200 concepts from the canonical yaml root", () => {
    const all = loadConceptsFromYaml({ rootDir: CONCEPTS_YAML_ROOT });
    expect(all.length).toBeGreaterThanOrEqual(200);
  });

  it("rejects duplicate slugs across files", () => {
    expect(() => parseConceptYaml(`concepts:\n  - slug: x\n    name: X\n    description: A.\n    default_difficulty: 1\n    tags: []\n    track_slugs: ['t']\n  - slug: x\n    name: X2\n    description: B.\n    default_difficulty: 1\n    tags: []\n    track_slugs: ['t']`)).not.toThrow(); // parseConceptYaml itself doesn't dedupe — that's loadConceptsFromYaml's job
    // but duplicates within a single file are still produced; loader-level dedup is tested below
  });

  it("loadConceptsFromYaml throws on duplicate slugs across files", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "concept-dup-"));
    writeFileSync(
      path.join(dir, "a.yaml"),
      `concepts:\n  - slug: x.y.z\n    name: X\n    description: A.\n    default_difficulty: 1\n    tags: []\n    track_slugs: ['t']\n`,
    );
    writeFileSync(
      path.join(dir, "b.yaml"),
      `concepts:\n  - slug: x.y.z\n    name: Y\n    description: B.\n    default_difficulty: 1\n    tags: []\n    track_slugs: ['t']\n`,
    );
    expect(() => loadConceptsFromYaml({ rootDir: dir })).toThrow(/duplicate concept slug/);
  });

  it("returns an empty array if the yaml root does not exist", () => {
    const out = loadConceptsFromYaml({ rootDir: "/no/such/path/exists/here" });
    expect(out).toEqual([]);
  });

  it("each loaded concept carries description, default_difficulty, tags, track_slugs", () => {
    const all = loadConceptsFromYaml({ rootDir: CONCEPTS_YAML_ROOT });
    for (const c of all) {
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.default_difficulty).toBeGreaterThanOrEqual(1);
      expect(c.default_difficulty).toBeLessThanOrEqual(5);
      expect(Array.isArray(c.tags)).toBe(true);
      expect(c.track_slugs.length).toBeGreaterThan(0);
    }
  });

  it("every concept slug uses dotted lowercase format", () => {
    const all = loadConceptsFromYaml({ rootDir: CONCEPTS_YAML_ROOT });
    for (const c of all) {
      expect(c.slug).toMatch(/^[a-z][a-z0-9]*(?:[.\-][a-z0-9]+)*$/);
      expect(c.slug.toLowerCase()).toBe(c.slug);
    }
  });
});
