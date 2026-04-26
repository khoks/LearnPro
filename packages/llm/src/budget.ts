import { ANTHROPIC_HAIKU, ANTHROPIC_OPUS, type RoleModelMap } from "./models.js";
import { ANTHROPIC_SONNET } from "./pricing.js";
import { TokenBudgetExceededError } from "./errors.js";
import type { LLMRole } from "./types.js";

export interface DailyUsage {
  user_id: string;
  date: string; // YYYY-MM-DD in UTC
  tokens: number;
}

// UsageStore is the abstraction the budget tracker depends on. The DB-backed implementation
// (writes to the `agent_calls` table) lands when the schema migration ships — see the
// STORY-012 close-out. The in-memory impl is sufficient for tests and self-hosted no-budget mode.
export interface UsageStore {
  today(user_id: string, now?: Date): Promise<number>;
  record(user_id: string, tokens: number, now?: Date): Promise<void>;
}

export class InMemoryUsageStore implements UsageStore {
  private readonly buckets = new Map<string, number>();

  async today(user_id: string, now: Date = new Date()): Promise<number> {
    return this.buckets.get(this.key(user_id, now)) ?? 0;
  }

  async record(user_id: string, tokens: number, now: Date = new Date()): Promise<void> {
    const k = this.key(user_id, now);
    this.buckets.set(k, (this.buckets.get(k) ?? 0) + tokens);
  }

  private key(user_id: string, now: Date): string {
    return `${user_id}|${now.toISOString().slice(0, 10)}`;
  }
}

// Tier ladder used for graceful downgrades when a user nears their daily budget.
// Indexed by name so callers can extend the map (e.g. add an `embed` tier later).
export const MODEL_TIERS = {
  premium: ANTHROPIC_OPUS,
  mid: ANTHROPIC_SONNET,
  cheap: ANTHROPIC_HAIKU,
} as const;
export type ModelTier = keyof typeof MODEL_TIERS;

const TIER_ORDER: ModelTier[] = ["premium", "mid", "cheap"];

export interface DailyTokenBudgetOptions {
  store: UsageStore;
  // 0 = unlimited (self-hosted default).
  daily_limit_tokens: number;
  // Threshold (0..1) at which to downgrade by one tier. Default 0.8.
  downgrade_threshold?: number;
  models?: RoleModelMap;
  now?: () => Date;
}

export interface DecideModelInput {
  user_id: string;
  role?: LLMRole;
  explicit_model?: string;
}

export interface DecideModelResult {
  model: string;
  tier: ModelTier | null;
  reason: "explicit" | "no_user" | "unlimited" | "under_threshold" | "downgraded";
  used_tokens: number;
  ratio: number;
}

export class DailyTokenBudget {
  private readonly store: UsageStore;
  private readonly limit: number;
  private readonly threshold: number;
  private readonly models: RoleModelMap | undefined;
  private readonly now: () => Date;

  constructor(opts: DailyTokenBudgetOptions) {
    this.store = opts.store;
    this.limit = opts.daily_limit_tokens;
    this.threshold = opts.downgrade_threshold ?? 0.8;
    this.models = opts.models;
    this.now = opts.now ?? (() => new Date());
  }

  // Throws TokenBudgetExceededError if the user has already hit their daily limit.
  // No-op when limit is 0 (unlimited) or when no user_id is provided (self-hosted system call).
  async assertWithinBudget(user_id: string | undefined): Promise<void> {
    if (!user_id || this.limit === 0) return;
    const used = await this.store.today(user_id, this.now());
    if (used >= this.limit) {
      throw new TokenBudgetExceededError(user_id, used, this.limit);
    }
  }

  // Pick the model to use. Downgrades by one tier when at/over the threshold.
  // Explicit model always wins (caller has opted out of the budget controller).
  async decideModel(input: DecideModelInput): Promise<DecideModelResult> {
    if (input.explicit_model) {
      return {
        model: input.explicit_model,
        tier: tierForModel(input.explicit_model),
        reason: "explicit",
        used_tokens: 0,
        ratio: 0,
      };
    }
    const baseline = baselineModel(input.role, this.models);
    if (!input.user_id || this.limit === 0) {
      return {
        model: baseline,
        tier: tierForModel(baseline),
        reason: input.user_id ? "unlimited" : "no_user",
        used_tokens: 0,
        ratio: 0,
      };
    }
    const used = await this.store.today(input.user_id, this.now());
    const ratio = used / this.limit;
    const baselineTier = tierForModel(baseline);
    if (ratio < this.threshold || baselineTier === null) {
      return {
        model: baseline,
        tier: baselineTier,
        reason: "under_threshold",
        used_tokens: used,
        ratio,
      };
    }
    const downgraded = downgradeOneTier(baselineTier);
    return {
      model: MODEL_TIERS[downgraded],
      tier: downgraded,
      reason: "downgraded",
      used_tokens: used,
      ratio,
    };
  }

  async record(user_id: string | undefined, tokens: number): Promise<void> {
    if (!user_id || tokens <= 0) return;
    await this.store.record(user_id, tokens, this.now());
  }
}

function tierForModel(model: string): ModelTier | null {
  for (const tier of TIER_ORDER) {
    if (MODEL_TIERS[tier] === model) return tier;
  }
  return null;
}

function downgradeOneTier(tier: ModelTier): ModelTier {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx < 0 || idx === TIER_ORDER.length - 1) return "cheap";
  return TIER_ORDER[idx + 1] as ModelTier;
}

function baselineModel(role: LLMRole | undefined, map: RoleModelMap | undefined): string {
  if (role && map) return map[role];
  if (role) {
    return role === "tutor" || role === "interviewer" || role === "reflection"
      ? ANTHROPIC_OPUS
      : ANTHROPIC_HAIKU;
  }
  return ANTHROPIC_HAIKU;
}
