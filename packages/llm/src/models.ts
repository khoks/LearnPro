import { z } from "zod";
import type { LLMRole } from "./types.js";

export const ANTHROPIC_OPUS = "claude-opus-4-7";
export const ANTHROPIC_HAIKU = "claude-haiku-4-5-20251001";
export const ANTHROPIC_EMBED = "voyage-3";

export const RoleModelMapSchema = z.object({
  tutor: z.string().default(ANTHROPIC_OPUS),
  interviewer: z.string().default(ANTHROPIC_OPUS),
  reflection: z.string().default(ANTHROPIC_OPUS),
  grader: z.string().default(ANTHROPIC_HAIKU),
  router: z.string().default(ANTHROPIC_HAIKU),
});
export type RoleModelMap = z.infer<typeof RoleModelMapSchema>;

export const DEFAULT_ROLE_MODEL_MAP: RoleModelMap = RoleModelMapSchema.parse({});

export function modelForRole(role: LLMRole, map: RoleModelMap = DEFAULT_ROLE_MODEL_MAP): string {
  return map[role];
}

export function resolveModel(opts: {
  explicit?: string;
  role?: LLMRole;
  fallback?: string;
  map?: RoleModelMap;
}): string {
  if (opts.explicit) return opts.explicit;
  if (opts.role) return modelForRole(opts.role, opts.map);
  if (opts.fallback) return opts.fallback;
  return ANTHROPIC_HAIKU;
}
