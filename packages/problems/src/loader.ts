import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import { and, eq, sql } from "drizzle-orm";
import type { LearnProDb } from "@learnpro/db";
import { problems, tracks, SELF_HOSTED_ORG_ID } from "@learnpro/db";
import { ProblemDefSchema, type ProblemDef, type ProblemLanguage } from "./schema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROBLEMS_ROOT = path.resolve(HERE, "..");

const LANGUAGE_DIRS: Record<ProblemLanguage, string> = {
  python: "python",
  typescript: "typescript",
};

export interface LoadProblemsOptions {
  rootDir?: string;
}

export function loadProblems(opts: LoadProblemsOptions = {}): ProblemDef[] {
  const root = opts.rootDir ?? PROBLEMS_ROOT;
  const out: ProblemDef[] = [];
  for (const language of Object.keys(LANGUAGE_DIRS) as ProblemLanguage[]) {
    const dir = path.join(root, LANGUAGE_DIRS[language]);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
      const file = path.join(dir, entry);
      const raw = readFileSync(file, "utf8");
      const parsed = parseYaml(raw);
      const result = ProblemDefSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`invalid problem at ${file}: ${result.error.message}`);
      }
      if (result.data.language !== language) {
        throw new Error(
          `problem at ${file} declared language=${result.data.language} but lives under ${language}/`,
        );
      }
      out.push(result.data);
    }
  }
  return out;
}

export interface SeedProblemsOptions {
  org_id?: string;
}

export interface SeedProblemsResult {
  inserted: number;
  updated: number;
}

export async function seedProblems(
  db: LearnProDb,
  defs: ProblemDef[],
  opts: SeedProblemsOptions = {},
): Promise<SeedProblemsResult> {
  const org_id = opts.org_id ?? SELF_HOSTED_ORG_ID;
  const trackSlugs = Array.from(new Set(defs.map((d) => d.track)));
  const trackIdByslug = new Map<string, string>();
  for (const slug of trackSlugs) {
    const rows = await db
      .select({ id: tracks.id })
      .from(tracks)
      .where(and(eq(tracks.org_id, org_id), eq(tracks.slug, slug)));
    const id = rows[0]?.id;
    if (!id) {
      throw new Error(`track '${slug}' not found; have you seeded tracks?`);
    }
    trackIdByslug.set(slug, id);
  }

  let inserted = 0;
  let updated = 0;
  for (const def of defs) {
    const track_id = trackIdByslug.get(def.track);
    if (!track_id) {
      throw new Error(`internal: missing track '${def.track}' in id map`);
    }
    const result = await db
      .insert(problems)
      .values({
        org_id,
        track_id,
        slug: def.slug,
        name: def.name,
        language: def.language,
        difficulty: String(def.difficulty),
        statement: def.statement,
        starter_code: def.starter_code,
        hidden_tests: {
          cases: def.hidden_tests,
          public_examples: def.public_examples,
          reference_solution: def.reference_solution,
          concept_tags: def.concept_tags,
          expected_median_time_to_solve_ms: def.expected_median_time_to_solve_ms,
        },
      })
      .onConflictDoUpdate({
        target: [problems.org_id, problems.track_id, problems.slug],
        set: {
          name: def.name,
          language: def.language,
          difficulty: String(def.difficulty),
          statement: def.statement,
          starter_code: def.starter_code,
          hidden_tests: {
            cases: def.hidden_tests,
            public_examples: def.public_examples,
            reference_solution: def.reference_solution,
            concept_tags: def.concept_tags,
            expected_median_time_to_solve_ms: def.expected_median_time_to_solve_ms,
          },
        },
      })
      .returning({ inserted: sql<boolean>`xmax = 0` });
    const row = result[0];
    if (row?.inserted === true) inserted += 1;
    else updated += 1;
  }
  return { inserted, updated };
}
