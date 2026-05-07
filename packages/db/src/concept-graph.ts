import { z } from "zod";

const KEBAB_DOTTED = /^[a-z][a-z0-9]*(?:[.\-][a-z0-9]+)*$/;

export const ConceptSlugSchema = z
  .string()
  .min(1)
  .regex(KEBAB_DOTTED, "concept slug must be lowercase, dot- or kebab-separated");

export const ConceptDifficultySchema = z.number().int().min(1).max(5);

export const ConceptYamlEntrySchema = z.object({
  slug: ConceptSlugSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  default_difficulty: ConceptDifficultySchema,
  tags: z.array(z.string().min(1)).default([]),
  track_slugs: z.array(z.string().min(1)).min(1),
});
export type ConceptYamlEntry = z.infer<typeof ConceptYamlEntrySchema>;

export const ConceptYamlFileSchema = z.object({
  concepts: z.array(ConceptYamlEntrySchema).min(1),
});
export type ConceptYamlFile = z.infer<typeof ConceptYamlFileSchema>;

export const PrerequisiteEdgeYamlSchema = z.object({
  from: ConceptSlugSchema,
  to: ConceptSlugSchema,
});
export type PrerequisiteEdgeYaml = z.infer<typeof PrerequisiteEdgeYamlSchema>;

export const PrerequisiteYamlFileSchema = z.object({
  prerequisites: z.array(PrerequisiteEdgeYamlSchema).min(1),
});
export type PrerequisiteYamlFile = z.infer<typeof PrerequisiteYamlFileSchema>;

export interface CycleDetectionResult {
  hasCycle: boolean;
  cycle?: string[];
}

/**
 * Pure DFS cycle-detection over a directed graph of concept slugs. Edges are
 * encoded as `from -> to` ("from depends on to" — to is a prerequisite of from).
 * If a cycle exists, returns the cycle as a slug list with the start vertex
 * appearing twice (e.g. `["a", "b", "c", "a"]`); otherwise returns `{ hasCycle: false }`.
 */
export function detectCycles(
  conceptSlugs: readonly string[],
  edges: ReadonlyArray<{ from: string; to: string }>,
): CycleDetectionResult {
  const known = new Set(conceptSlugs);
  const adj = new Map<string, string[]>();
  for (const slug of conceptSlugs) adj.set(slug, []);
  for (const edge of edges) {
    if (!known.has(edge.from)) {
      throw new Error(
        `prerequisite edge references unknown concept '${edge.from}' (in 'from')`,
      );
    }
    if (!known.has(edge.to)) {
      throw new Error(`prerequisite edge references unknown concept '${edge.to}' (in 'to')`);
    }
    adj.get(edge.from)!.push(edge.to);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const slug of conceptSlugs) color.set(slug, WHITE);

  const parent = new Map<string, string | null>();
  let cycleStart: string | null = null;
  let cycleEnd: string | null = null;

  const visit = (u: string): boolean => {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === WHITE) {
        parent.set(v, u);
        if (visit(v)) return true;
      } else if (c === GRAY) {
        cycleStart = v;
        cycleEnd = u;
        return true;
      }
    }
    color.set(u, BLACK);
    return false;
  };

  for (const slug of conceptSlugs) {
    if (color.get(slug) === WHITE) {
      if (visit(slug)) {
        const cycle: string[] = [];
        let cur = cycleEnd!;
        cycle.push(cur);
        while (cur !== cycleStart) {
          cur = parent.get(cur)!;
          cycle.push(cur);
        }
        cycle.push(cycleEnd!);
        cycle.reverse();
        return { hasCycle: true, cycle };
      }
    }
  }

  return { hasCycle: false };
}

/**
 * BFS shortest-path walk from `from_slug` to `to_slug` over the prerequisite
 * graph (interpreted as `from -> to` edges). Returns the slug list including
 * both endpoints, or an empty array if no path exists.
 *
 * Used as a sanity-check for AC #4 (validates the graph is shaped correctly).
 */
export function walkConceptGraph(
  fromSlug: string,
  toSlug: string,
  edges: ReadonlyArray<{ from: string; to: string }>,
): string[] {
  if (fromSlug === toSlug) return [fromSlug];
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const queue: string[] = [fromSlug];
  const parent = new Map<string, string | null>();
  parent.set(fromSlug, null);
  while (queue.length > 0) {
    const u = queue.shift()!;
    if (u === toSlug) {
      const path: string[] = [];
      let cur: string | null = u;
      while (cur !== null) {
        path.push(cur);
        cur = parent.get(cur) ?? null;
      }
      return path.reverse();
    }
    for (const v of adj.get(u) ?? []) {
      if (!parent.has(v)) {
        parent.set(v, u);
        queue.push(v);
      }
    }
  }
  return [];
}

/**
 * Topological order over the concept graph (Kahn's). Returns slugs in
 * dependency order — i.e. each concept appears AFTER every concept it
 * depends on. Throws if the graph has a cycle (callers should run
 * `detectCycles` first for a cleaner error).
 */
export function topologicalOrder(
  conceptSlugs: readonly string[],
  edges: ReadonlyArray<{ from: string; to: string }>,
): string[] {
  const inDegree = new Map<string, number>();
  const reverseAdj = new Map<string, string[]>();
  for (const slug of conceptSlugs) {
    inDegree.set(slug, 0);
    reverseAdj.set(slug, []);
  }
  // 'from depends on to', so 'to' should come first. We reverse and topo-sort
  // so callers receive prerequisites-before-dependents order.
  for (const e of edges) {
    inDegree.set(e.from, (inDegree.get(e.from) ?? 0) + 1);
    reverseAdj.get(e.to)!.push(e.from);
  }
  const queue: string[] = [];
  for (const [slug, deg] of inDegree) if (deg === 0) queue.push(slug);
  queue.sort();
  const out: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    out.push(u);
    for (const v of reverseAdj.get(u) ?? []) {
      const next = (inDegree.get(v) ?? 0) - 1;
      inDegree.set(v, next);
      if (next === 0) {
        queue.push(v);
        queue.sort();
      }
    }
  }
  if (out.length !== conceptSlugs.length) {
    throw new Error("topologicalOrder: graph has a cycle");
  }
  return out;
}
