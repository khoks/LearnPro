import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import {
  ConceptYamlEntrySchema,
  ConceptYamlFileSchema,
  type ConceptYamlEntry,
} from "./concept-graph.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONCEPTS_YAML_ROOT = path.resolve(HERE, "..", "concepts", "yaml");

export interface LoadedConcept extends ConceptYamlEntry {
  source_file: string;
}

export interface LoadConceptsOptions {
  rootDir?: string;
}

const CONCEPT_FILES = [
  "python-fundamentals.yaml",
  "python-advanced.yaml",
  "typescript-fundamentals.yaml",
  "typescript-advanced.yaml",
  "dsa.yaml",
  "frameworks-basics.yaml",
];

export function loadConceptsFromYaml(opts: LoadConceptsOptions = {}): LoadedConcept[] {
  const root = opts.rootDir ?? CONCEPTS_YAML_ROOT;
  const out: LoadedConcept[] = [];
  const seen = new Set<string>();

  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }

  // Walk the canonical list first to give a deterministic order, then any extras
  // (e.g. test fixtures) that might be present.
  const ordered = [
    ...CONCEPT_FILES.filter((f) => entries.includes(f)),
    ...entries.filter(
      (f) =>
        !CONCEPT_FILES.includes(f) &&
        f !== "prerequisites.yaml" &&
        (f.endsWith(".yaml") || f.endsWith(".yml")),
    ),
  ];

  for (const file of ordered) {
    const fullPath = path.join(root, file);
    const raw = readFileSync(fullPath, "utf8");
    const parsed = parseYaml(raw);
    const result = ConceptYamlFileSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`invalid concept file at ${fullPath}: ${result.error.message}`);
    }
    for (const entry of result.data.concepts) {
      if (seen.has(entry.slug)) {
        throw new Error(
          `duplicate concept slug '${entry.slug}' detected (second occurrence in ${fullPath})`,
        );
      }
      seen.add(entry.slug);
      out.push({ ...entry, source_file: file });
    }
  }
  return out;
}

/**
 * Pure parse-and-validate of a single concept YAML file. Used by tests +
 * the loader above; exposed so tooling can validate one file at a time.
 */
export function parseConceptYaml(yamlText: string): ConceptYamlEntry[] {
  const parsed = parseYaml(yamlText);
  const result = ConceptYamlFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`invalid concept yaml: ${result.error.message}`);
  }
  return result.data.concepts.map((c) => ConceptYamlEntrySchema.parse(c));
}
