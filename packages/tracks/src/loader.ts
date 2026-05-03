import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import { loadProblems, type ProblemDef } from "@learnpro/problems";
import { TrackSchema, type Track } from "./schema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TRACKS_ROOT = path.resolve(HERE, "..");

export const PYTHON_FUNDAMENTALS_PATH = path.join(TRACKS_ROOT, "python-fundamentals.yaml");

export interface LoadTrackOptions {
  /**
   * Override the problem-bank set used for orphan-ref validation. Tests can
   * inject a stubbed bank; production callers leave this unset and let
   * `loadProblems()` walk the on-disk seed bank.
   */
  knownProblemSlugs?: ReadonlySet<string>;
}

export function loadTrack(yamlPath: string, opts: LoadTrackOptions = {}): Track {
  const raw = readFileSync(yamlPath, "utf8");
  const parsed = parseYaml(raw);
  const result = TrackSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`invalid track at ${yamlPath}: ${result.error.message}`);
  }
  const track = result.data;

  const knownSlugs =
    opts.knownProblemSlugs ?? new Set(loadProblemsForLanguage(track.language).map((p) => p.slug));

  const seenConceptSlugs = new Set<string>();
  for (const concept of track.ordered_concepts) {
    if (seenConceptSlugs.has(concept.slug)) {
      throw new Error(`track at ${yamlPath} declares concept '${concept.slug}' more than once`);
    }
    for (const prereq of concept.prerequisite_concept_slugs) {
      if (!seenConceptSlugs.has(prereq)) {
        throw new Error(
          `track at ${yamlPath}: concept '${concept.slug}' references prerequisite ` +
            `'${prereq}' that does not appear earlier in ordered_concepts`,
        );
      }
    }
    for (const problemSlug of concept.seed_problem_slugs) {
      if (!knownSlugs.has(problemSlug)) {
        throw new Error(
          `track at ${yamlPath}: concept '${concept.slug}' references problem ` +
            `slug '${problemSlug}' that is not present in the ${track.language} seed bank`,
        );
      }
    }
    seenConceptSlugs.add(concept.slug);
  }

  return track;
}

function loadProblemsForLanguage(language: Track["language"]): ProblemDef[] {
  return loadProblems().filter((p) => p.language === language);
}
