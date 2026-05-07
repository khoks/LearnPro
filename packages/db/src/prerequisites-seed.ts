import { readFileSync } from "node:fs";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import {
  PrerequisiteYamlFileSchema,
  detectCycles,
  type PrerequisiteEdgeYaml,
} from "./concept-graph.js";
import { CONCEPTS_YAML_ROOT } from "./concepts-seed.js";

export const PREREQUISITES_YAML_PATH = path.join(CONCEPTS_YAML_ROOT, "prerequisites.yaml");

export interface LoadPrerequisitesOptions {
  yamlPath?: string;
  /**
   * The set of known concept slugs the edges may reference. Cycle detection
   * also runs against this set; an edge naming an unknown slug is rejected.
   */
  knownConceptSlugs: ReadonlySet<string>;
}

export function loadPrerequisitesFromYaml(
  opts: LoadPrerequisitesOptions,
): PrerequisiteEdgeYaml[] {
  const yamlPath = opts.yamlPath ?? PREREQUISITES_YAML_PATH;
  const raw = readFileSync(yamlPath, "utf8");
  const parsed = parseYaml(raw);
  const result = PrerequisiteYamlFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`invalid prerequisites yaml at ${yamlPath}: ${result.error.message}`);
  }
  const edges = result.data.prerequisites;

  for (const edge of edges) {
    if (!opts.knownConceptSlugs.has(edge.from)) {
      throw new Error(
        `prerequisites yaml at ${yamlPath}: edge references unknown 'from' slug '${edge.from}'`,
      );
    }
    if (!opts.knownConceptSlugs.has(edge.to)) {
      throw new Error(
        `prerequisites yaml at ${yamlPath}: edge references unknown 'to' slug '${edge.to}'`,
      );
    }
    if (edge.from === edge.to) {
      throw new Error(
        `prerequisites yaml at ${yamlPath}: self-edge detected on '${edge.from}'`,
      );
    }
  }

  // Reject duplicate edges so we never write a row that the unique index
  // would silently accept-as-duplicate later.
  const seen = new Set<string>();
  for (const edge of edges) {
    const key = `${edge.from}|${edge.to}`;
    if (seen.has(key)) {
      throw new Error(
        `prerequisites yaml at ${yamlPath}: duplicate edge '${edge.from} -> ${edge.to}'`,
      );
    }
    seen.add(key);
  }

  const cycle = detectCycles([...opts.knownConceptSlugs], edges);
  if (cycle.hasCycle) {
    throw new Error(
      `prerequisites yaml at ${yamlPath}: cycle detected: ${cycle.cycle?.join(" -> ")}`,
    );
  }

  return edges;
}
