// STORY-039f — batch helper that tops up the `problem_variants` cache for a single source
// problem to a target count. Wraps `generateProblemVariant` with cache-aware semantics so
// an operator CLI (or future cron) can drive seeding without re-implementing the
// "look at cache, fill in missing slots, persist" loop.
//
// Design intent:
//   - Pure: takes a small `VariantCacheStore` port instead of a `LearnProDb` so tests can
//     stub the cache with an in-memory implementation. The CLI wires a real
//     `LearnProDb`-backed adapter.
//   - Idempotent: if the cache already has ≥ `targetCount` rows, no LLM calls happen.
//   - Best-effort: partial successes are persisted. The function never throws on agent
//     failure — it returns the counts it managed.
//   - Dry-run: when `dryRun` is true, skip the LLM + DB writes entirely. Useful for an
//     operator to preview what a real run would do before paying for tokens.

import {
  generateProblemVariant,
  type GenerateProblemVariantInput,
  type ProblemVariantsTelemetry,
} from "./problem-variants.js";
import type { LLMProvider } from "@learnpro/llm";
import { ProblemDefSchema, type ImplementProblemDef, type ProblemDef } from "@learnpro/problems";
import type { SandboxProvider } from "@learnpro/sandbox";

// Minimal contract the batch helper needs from a cache store. Implemented in the CLI by a
// thin adapter around `listProblemVariants` / `insertProblemVariant` from `@learnpro/db`;
// stubbed in tests with an in-memory map. Keeping the port small (two methods) keeps the
// helper testable without standing up Drizzle.
export interface VariantCacheStore {
  // Returns the cached `ProblemDef`s for a source problem id (newest first OK; the helper
  // doesn't depend on ordering). Caller already validated structure with
  // `ProblemDefSchema` — the helper trusts the returned defs.
  list(source_problem_id: string): Promise<ProblemDef[]>;
  // Persists a freshly-generated variant. Returns the persisted def (so the helper can
  // re-validate the round-trip if it wishes). Caller MUST have run `ProblemDefSchema`
  // before calling.
  insert(input: { source_problem_id: string; variant_def: ProblemDef }): Promise<ProblemDef>;
}

export interface SeedVariantsTelemetry {
  // Emitted when a generation attempt succeeded and was persisted to the cache. `attempt`
  // is the 1-indexed slot within the current call (not across calls).
  generated: (event: { source_slug: string; slug: string; attempt: number }) => void;
  // Emitted when a generation attempt produced no variant (agent fell back). The slot is
  // counted as a failure for the summary.
  failed: (event: { source_slug: string; attempt: number; reason: string }) => void;
  // Emitted when the cache short-circuit fired — no LLM calls were made.
  skipped: (event: { source_slug: string; cached: number; target: number }) => void;
}

export interface SeedVariantsForProblemInput {
  llm: LLMProvider;
  user_id?: string;
  sourceProblem: ImplementProblemDef;
  // Stable id (uuid) of the source row in the `problems` table. This is the cache key.
  sourceProblemId: string;
  // Desired total cached variants for this source. The helper tops up to this number.
  // Clamped to [1, MAX_TARGET_COUNT].
  targetCount: number;
  cache: VariantCacheStore;
  // When true, no LLM calls happen; the function reports what would have been generated.
  dryRun?: boolean;
  // Optional sandbox for STORY-039a self-validation. When unset, agent skips validation.
  sandbox?: SandboxProvider;
  // Override the agent's Haiku default — used by tests + future operator tuning.
  model?: string;
  // Optional callback for progress / telemetry. Each is fire-and-forget; throws are
  // swallowed so a sink hiccup never blocks seeding.
  onProgress?: Partial<SeedVariantsTelemetry>;
}

export interface SeedVariantsForProblemOutput {
  // Number of fresh variants generated AND persisted to the cache during this call.
  generated: number;
  // Number of variants already in the cache before this call started. Reported even on
  // short-circuit so the caller can sum up cache hits across a batch.
  cached: number;
  // Number of LLM attempts that failed (agent returned an empty list for a slot).
  failed: number;
  // Only present when `dryRun: true` — the number of variants that WOULD have been
  // generated had this been a real call.
  would_generate?: number;
}

const MAX_TARGET_COUNT = 20;
const DEFAULT_USER_ID = "seed-variants-cli";

export async function seedVariantsForProblem(
  input: SeedVariantsForProblemInput,
): Promise<SeedVariantsForProblemOutput> {
  const target = clampTarget(input.targetCount);
  const cached = await input.cache.list(input.sourceProblemId);
  const cachedCount = cached.length;

  if (cachedCount >= target) {
    safeFire(input.onProgress?.skipped, {
      source_slug: input.sourceProblem.slug,
      cached: cachedCount,
      target,
    });
    return { generated: 0, cached: cachedCount, failed: 0 };
  }

  const missing = target - cachedCount;

  if (input.dryRun === true) {
    return {
      generated: 0,
      cached: cachedCount,
      failed: 0,
      would_generate: missing,
    };
  }

  let generated = 0;
  let failed = 0;
  // Tracks slugs already cached + already produced this call so the agent never returns a
  // duplicate slug on retries (matches the existing `usedSlugs` set inside the agent for a
  // single call, extended here across our N single-variant calls).
  const usedSlugs = new Set<string>(cached.map((c) => c.slug));

  for (let slot = 0; slot < missing; slot++) {
    const attempt = slot + 1;
    const agentInput: GenerateProblemVariantInput = {
      llm: input.llm,
      user_id: input.user_id ?? DEFAULT_USER_ID,
      source: input.sourceProblem,
      count: 1,
      ...(input.sandbox !== undefined ? { sandbox: input.sandbox } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      onTelemetry: buildAgentTelemetryAdapter(),
    };
    let agentOut;
    try {
      agentOut = await generateProblemVariant(agentInput);
    } catch (err) {
      failed += 1;
      safeFire(input.onProgress?.failed, {
        source_slug: input.sourceProblem.slug,
        attempt,
        reason: `agent_threw: ${(err as Error).message}`,
      });
      continue;
    }

    const variant = agentOut.variants[0];
    if (!variant) {
      failed += 1;
      safeFire(input.onProgress?.failed, {
        source_slug: input.sourceProblem.slug,
        attempt,
        reason: agentOut.fallback_used ? "agent_fallback" : "empty_variants",
      });
      continue;
    }

    if (usedSlugs.has(variant.slug)) {
      failed += 1;
      safeFire(input.onProgress?.failed, {
        source_slug: input.sourceProblem.slug,
        attempt,
        reason: "duplicate_slug",
      });
      continue;
    }

    const reparsed = ProblemDefSchema.safeParse(variant);
    if (!reparsed.success) {
      failed += 1;
      safeFire(input.onProgress?.failed, {
        source_slug: input.sourceProblem.slug,
        attempt,
        reason: "reparse_failed",
      });
      continue;
    }

    try {
      await input.cache.insert({
        source_problem_id: input.sourceProblemId,
        variant_def: reparsed.data,
      });
    } catch (err) {
      failed += 1;
      safeFire(input.onProgress?.failed, {
        source_slug: input.sourceProblem.slug,
        attempt,
        reason: `cache_insert_failed: ${(err as Error).message}`,
      });
      continue;
    }

    usedSlugs.add(variant.slug);
    generated += 1;
    safeFire(input.onProgress?.generated, {
      source_slug: input.sourceProblem.slug,
      slug: variant.slug,
      attempt,
    });
  }

  return { generated, cached: cachedCount, failed };
}

// The agent emits its own telemetry counters (variants_generated / _validated_pass /
// _dropped_fail). We don't need to surface these one-by-one to the operator — the batch
// helper's own per-attempt callbacks are the right granularity. Returning an empty adapter
// keeps the agent happy without forcing the operator to handle two telemetry shapes.
function buildAgentTelemetryAdapter(): Partial<ProblemVariantsTelemetry> {
  return {};
}

function clampTarget(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const rounded = Math.floor(n);
  if (rounded < 1) return 1;
  if (rounded > MAX_TARGET_COUNT) return MAX_TARGET_COUNT;
  return rounded;
}

function safeFire<T>(fn: ((e: T) => void) | undefined, event: T): void {
  if (fn === undefined) return;
  try {
    fn(event);
  } catch {
    // intentional drop — telemetry is fire-and-forget
  }
}

export const SEED_VARIANTS_MAX_TARGET_COUNT = MAX_TARGET_COUNT;
