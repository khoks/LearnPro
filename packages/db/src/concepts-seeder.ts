import { and, eq, inArray, sql } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { concepts, prerequisites, SELF_HOSTED_ORG_ID } from "./schema.js";
import { CONCEPTS_YAML_ROOT, loadConceptsFromYaml, type LoadedConcept } from "./concepts-seed.js";
import { PREREQUISITES_YAML_PATH, loadPrerequisitesFromYaml } from "./prerequisites-seed.js";

export interface SeedConceptsOptions {
  org_id?: string;
  /** Override the YAML root (tests pass in a fixture dir). */
  yamlRoot?: string;
  /** Override the prerequisites YAML path (tests pass in a fixture). */
  prerequisitesYamlPath?: string;
  /**
   * If a concept exists in DB but is NOT in the YAML, what should we do?
   * Default 'keep' — never delete a concept (skill_scores / concept_reviews FK
   * cascade would wipe learner state). Tests can pass 'delete-orphans' to
   * exercise that branch deterministically.
   */
  orphanPolicy?: "keep" | "delete-orphans";
}

export interface SeedConceptsResult {
  concepts_inserted: number;
  concepts_updated: number;
  concepts_orphan_kept: number;
  concepts_orphan_deleted: number;
  prerequisites_inserted: number;
  prerequisites_deleted: number;
}

/**
 * UPSERTs the YAML-defined concepts and replaces the prerequisite-edge set
 * to match. The replacement is non-destructive for orphan concepts by default
 * (skill_scores / concept_reviews / spaced-repetition state cascade-deletes
 * with the row).
 *
 * Idempotent: re-running on an unchanged YAML produces 0 inserts / 0 deletes.
 */
export async function seedConceptsFromYaml(
  db: LearnProDb,
  opts: SeedConceptsOptions = {},
): Promise<SeedConceptsResult> {
  const org_id = opts.org_id ?? SELF_HOSTED_ORG_ID;
  const yamlRoot = opts.yamlRoot ?? CONCEPTS_YAML_ROOT;

  const loaded = loadConceptsFromYaml({ rootDir: yamlRoot });
  if (loaded.length === 0) {
    throw new Error(`no concepts found under ${yamlRoot}`);
  }

  // Pick a single language token per concept. The schema's
  // (org_id, language, slug) unique index demands one. The story specifies
  // dotted slugs that already encode language+area, so we derive the language
  // from the first segment of the slug. Concepts that don't start with
  // python/typescript/dsa/web map to "general" (frameworks-basics, for example).
  const slugLang = (slug: string): string => {
    const head = slug.split(".")[0] ?? "general";
    if (head === "python" || head === "typescript") return head;
    if (head === "dsa") return "dsa";
    return "general";
  };

  const knownSlugs = new Set(loaded.map((c) => c.slug));
  const edges = loadPrerequisitesFromYaml({
    yamlPath: opts.prerequisitesYamlPath ?? PREREQUISITES_YAML_PATH,
    knownConceptSlugs: knownSlugs,
  });

  let concepts_inserted = 0;
  let concepts_updated = 0;
  for (const c of loaded) {
    const result = await db
      .insert(concepts)
      .values({
        org_id,
        slug: c.slug,
        name: c.name,
        language: slugLang(c.slug),
        description: c.description,
        default_difficulty: c.default_difficulty,
        tags: c.tags,
        track_slugs: c.track_slugs,
      })
      .onConflictDoUpdate({
        target: [concepts.org_id, concepts.language, concepts.slug],
        set: {
          name: c.name,
          description: c.description,
          default_difficulty: c.default_difficulty,
          tags: c.tags,
          track_slugs: c.track_slugs,
        },
      })
      .returning({ inserted: sql<boolean>`xmax = 0` });
    const row = result[0];
    if (row?.inserted === true) concepts_inserted += 1;
    else concepts_updated += 1;
  }

  // Orphan handling — concepts that exist in DB under our org but aren't in
  // any YAML file. By default we keep them (learner skill_scores point at
  // them). Tests use 'delete-orphans' to verify the schema cascade.
  const dbRows = await db
    .select({ id: concepts.id, slug: concepts.slug })
    .from(concepts)
    .where(eq(concepts.org_id, org_id));
  const dbSlugs = new Map(dbRows.map((r) => [r.slug, r.id]));
  const orphanIds: string[] = [];
  for (const [slug, id] of dbSlugs) {
    if (!knownSlugs.has(slug) && !isLegacyTrackSlug(slug)) {
      orphanIds.push(id);
    }
  }
  let concepts_orphan_deleted = 0;
  let concepts_orphan_kept = orphanIds.length;
  if (opts.orphanPolicy === "delete-orphans" && orphanIds.length > 0) {
    await db.delete(concepts).where(inArray(concepts.id, orphanIds));
    concepts_orphan_deleted = orphanIds.length;
    concepts_orphan_kept = 0;
  }

  // Prerequisites: build a slug -> id map (re-read so newly-inserted rows are
  // visible) and translate the edges.
  const allRows = await db
    .select({ id: concepts.id, slug: concepts.slug })
    .from(concepts)
    .where(eq(concepts.org_id, org_id));
  const idBySlug = new Map(allRows.map((r) => [r.slug, r.id]));

  // Compute the desired edge set as concept-id pairs.
  const desired = new Set<string>();
  const desiredEdges: Array<{ from_id: string; to_id: string }> = [];
  for (const e of edges) {
    const fromId = idBySlug.get(e.from);
    const toId = idBySlug.get(e.to);
    if (!fromId || !toId) {
      throw new Error(
        `internal: prerequisite edge '${e.from} -> ${e.to}' missing concept row after seed`,
      );
    }
    const key = `${fromId}|${toId}`;
    desired.add(key);
    desiredEdges.push({ from_id: fromId, to_id: toId });
  }

  const existingEdges = await db
    .select({
      id: prerequisites.id,
      from_concept_id: prerequisites.from_concept_id,
      to_concept_id: prerequisites.to_concept_id,
    })
    .from(prerequisites)
    .where(eq(prerequisites.org_id, org_id));

  const existingKeys = new Map<string, string>();
  for (const e of existingEdges) {
    existingKeys.set(`${e.from_concept_id}|${e.to_concept_id}`, e.id);
  }

  // Delete edges not in desired set.
  const toDelete: string[] = [];
  for (const [key, id] of existingKeys) {
    if (!desired.has(key)) toDelete.push(id);
  }
  let prerequisites_deleted = 0;
  if (toDelete.length > 0) {
    await db.delete(prerequisites).where(inArray(prerequisites.id, toDelete));
    prerequisites_deleted = toDelete.length;
  }

  // Insert edges that don't exist yet.
  let prerequisites_inserted = 0;
  for (const e of desiredEdges) {
    const key = `${e.from_id}|${e.to_id}`;
    if (existingKeys.has(key)) continue;
    await db
      .insert(prerequisites)
      .values({
        org_id,
        from_concept_id: e.from_id,
        to_concept_id: e.to_id,
      })
      .onConflictDoNothing();
    prerequisites_inserted += 1;
  }

  return {
    concepts_inserted,
    concepts_updated,
    concepts_orphan_kept,
    concepts_orphan_deleted,
    prerequisites_inserted,
    prerequisites_deleted,
  };
}

/**
 * The pre-STORY-032 track loaders (STORY-019/020) seeded a flat slug like
 * `variables-and-types`, not a dotted slug. We treat any non-dotted slug as
 * "legacy" — keep it, never warn — so re-seeding the knowledge graph doesn't
 * disturb existing learner skill_scores.
 */
function isLegacyTrackSlug(slug: string): boolean {
  return !slug.includes(".");
}

/** Public-facing helper used by the data-export tests + tooling. */
export async function listConceptsForOrg(
  db: LearnProDb,
  options: { org_id?: string } = {},
): Promise<Array<{ id: string; slug: string }>> {
  const org_id = options.org_id ?? SELF_HOSTED_ORG_ID;
  const rows = await db
    .select({ id: concepts.id, slug: concepts.slug })
    .from(concepts)
    .where(eq(concepts.org_id, org_id));
  return rows;
}

// Suppress an "unused import" warning if `and` isn't referenced elsewhere.
void and;

export type { LoadedConcept };
