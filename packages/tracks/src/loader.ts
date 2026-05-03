import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import { and, eq, sql } from "drizzle-orm";
import type { LearnProDb } from "@learnpro/db";
import { concepts, SELF_HOSTED_ORG_ID, tracks } from "@learnpro/db";
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

export interface SeedTrackOptions {
  org_id?: string;
}

export interface SeedTrackResult {
  track_inserted: boolean;
  concepts_inserted: number;
  concepts_updated: number;
}

// The mapping from concept-slug -> problem-slug list lives on the YAML rather
// than a join table: the bank is small (33 problems), the lookup is read-only
// at session-start time, and avoiding a `concept_problems` table keeps the MVP
// migration surface narrow. STORY-022's progress-bar UI can read the YAML
// directly via @learnpro/tracks once it lands.
export async function seedTrack(
  db: LearnProDb,
  track: Track,
  opts: SeedTrackOptions = {},
): Promise<SeedTrackResult> {
  const org_id = opts.org_id ?? SELF_HOSTED_ORG_ID;

  const existing = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(and(eq(tracks.org_id, org_id), eq(tracks.slug, track.slug)));
  const wasExisting = existing.length > 0;

  await db
    .insert(tracks)
    .values({
      org_id,
      slug: track.slug,
      name: track.name,
      language: track.language,
      description: track.description,
    })
    .onConflictDoUpdate({
      target: [tracks.org_id, tracks.slug],
      set: {
        name: track.name,
        language: track.language,
        description: track.description,
      },
    });

  let concepts_inserted = 0;
  let concepts_updated = 0;
  for (const card of track.ordered_concepts) {
    const result = await db
      .insert(concepts)
      .values({
        org_id,
        slug: card.slug,
        name: card.name,
        language: track.language,
      })
      .onConflictDoUpdate({
        target: [concepts.org_id, concepts.language, concepts.slug],
        set: {
          name: card.name,
        },
      })
      .returning({ inserted: sql<boolean>`xmax = 0` });
    const row = result[0];
    if (row?.inserted === true) concepts_inserted += 1;
    else concepts_updated += 1;
  }

  return {
    track_inserted: !wasExisting,
    concepts_inserted,
    concepts_updated,
  };
}
