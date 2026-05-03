import { z } from "zod";
import { HINT_RUNG_XP_COST } from "@learnpro/prompts";
import type { GiveHintDeps } from "../ports.js";
import { HintRungSchema, type HintRecord, type HintRung } from "../state.js";

export const GiveHintInputSchema = z.object({
  episode_id: z.string().uuid(),
  rung: HintRungSchema,
});
export type GiveHintInput = z.input<typeof GiveHintInputSchema>;

export const GiveHintOutputSchema = z.object({
  rung: HintRungSchema,
  hint: z.string().min(1),
  xp_cost: z.number().int().nonnegative(),
});
export type GiveHintOutput = z.infer<typeof GiveHintOutputSchema>;

export interface GiveHintTool {
  readonly name: "giveHint";
  run(input: GiveHintInput): Promise<GiveHintOutput>;
}

export interface CreateGiveHintToolOptions {
  deps: GiveHintDeps;
}

export class EpisodeNotFoundError extends Error {
  readonly episode_id: string;

  constructor(episode_id: string) {
    super(`episode not found: ${episode_id}`);
    this.name = "EpisodeNotFoundError";
    this.episode_id = episode_id;
  }
}

export function xpCostForRung(rung: HintRung): number {
  return HINT_RUNG_XP_COST[rung];
}

export function createGiveHintTool(opts: CreateGiveHintToolOptions): GiveHintTool {
  return {
    name: "giveHint",
    async run(rawInput) {
      const input = GiveHintInputSchema.parse(rawInput);
      const ctx = await opts.deps.loadEpisodeProblem({ episode_id: input.episode_id });
      if (!ctx) throw new EpisodeNotFoundError(input.episode_id);

      const { hint } = await opts.deps.generateHint({
        user_id: ctx.user_id,
        rung: input.rung,
        problem: ctx.problem,
        prior_hints: ctx.prior_hints,
      });

      // Bump the episode counter — failure here is operational and worth surfacing (the LLM call
      // already happened and was billed).
      await opts.deps.incrementHintsUsed({ episode_id: input.episode_id });

      return {
        rung: input.rung,
        hint,
        xp_cost: xpCostForRung(input.rung),
      };
    },
  };
}

// Helper for the state-machine driver: append a new hint record to the prior list.
export function appendHint(prior: ReadonlyArray<HintRecord>, next: HintRecord): HintRecord[] {
  return [...prior, next];
}
