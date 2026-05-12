import { z } from "zod";

// STORY-021 — career-aware onboarding interview, role library half. The conversational onboarding
// agent (STORY-053) captures `target_role` into `profiles.target_role`. This module maps that free
// text → a curated recommendation: which seed track(s) to suggest, how many minutes per day to
// practise, and a difficulty bias that future tutor / planner stories can read. JD parsing and
// resume gap analysis are v1 work (EPIC-010); MVP gets ~7 hardcoded roles.
//
// Free choice, no soft-locks (AC #3): every recommendation is a suggestion. The /recommended page
// renders the suggestion + a "Take me to the dashboard" link the user can always click instead.

export const RoleBiasSchema = z.enum(["standard", "math-heavy", "gentle-onramp"]);
export type RoleBias = z.infer<typeof RoleBiasSchema>;

const KEBAB_CASE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;

export const RoleSlugSchema = z
  .string()
  .min(1)
  .regex(KEBAB_CASE, "role slug must be lowercase kebab-case");

export const RecommendedTrackSlugSchema = z
  .string()
  .min(1)
  .regex(KEBAB_CASE, "recommended track slug must be lowercase kebab-case");

export const RoleSchema = z.object({
  slug: RoleSlugSchema,
  label: z.string().min(1),
  recommended_track_slugs: z.array(RecommendedTrackSlugSchema).min(1),
  recommended_daily_minutes: z.number().int().positive().max(240),
  bias: RoleBiasSchema,
});
export type Role = z.infer<typeof RoleSchema>;

export const RoleLibrarySchema = z.array(RoleSchema).min(1);
export type RoleLibrary = z.infer<typeof RoleLibrarySchema>;

// MVP role library. Track slugs intentionally match the YAMLs shipped by STORY-019 (Python) and
// STORY-020 (TypeScript) — see `packages/tracks/python-fundamentals.yaml` /
// `packages/tracks/typescript-fundamentals.yaml`. When a future Story adds a track YAML, callers
// can splice an entry in without touching the schema.
//
// Roles are listed in order of likely-frequency for the v0 user mix (career-switchers + students
// dominate); the order has no behavioural meaning — the lookup is by slug.
const RAW_LIBRARY: readonly Role[] = [
  {
    slug: "backend-engineer",
    label: "Backend engineer",
    // Two viable starting points: most backend roles ask for either Python or TS proficiency, so
    // we recommend both. The /recommended page renders both as separate clickable cards and lets
    // the user pick whichever language feels closer to their day-to-day.
    recommended_track_slugs: ["python-fundamentals", "typescript-fundamentals"],
    recommended_daily_minutes: 45,
    bias: "standard",
  },
  {
    slug: "frontend-engineer",
    label: "Frontend engineer",
    recommended_track_slugs: ["typescript-fundamentals"],
    recommended_daily_minutes: 45,
    bias: "standard",
  },
  {
    slug: "full-stack-engineer",
    // TS first, Python second — full-stack work in 2026 leans Node + a TS frontend; Python is the
    // common second-stack pickup. The order is preserved when the API joins to the `tracks` table.
    label: "Full-stack engineer",
    recommended_track_slugs: ["typescript-fundamentals", "python-fundamentals"],
    recommended_daily_minutes: 45,
    bias: "standard",
  },
  {
    slug: "ml-engineer",
    label: "ML engineer",
    // ML/DL tracks come in v3 (EPIC-009); for MVP we route ML aspirants through the Python core
    // first — tensors-and-grads tracks need solid Python. 60-min budget is on purpose: ML practice
    // sessions tend to be longer than vanilla code-kata sessions.
    recommended_track_slugs: ["python-fundamentals"],
    recommended_daily_minutes: 60,
    bias: "math-heavy",
  },
  {
    slug: "data-scientist",
    label: "Data scientist",
    recommended_track_slugs: ["python-fundamentals"],
    recommended_daily_minutes: 45,
    bias: "standard",
  },
  {
    slug: "career-switcher-from-data-analyst",
    label: "Career switcher (from data analyst)",
    recommended_track_slugs: ["python-fundamentals"],
    // 30-min on purpose: gentle-onramp users tend to be juggling a day job; we want a budget they
    // can hit consistently, not aspirationally.
    recommended_daily_minutes: 30,
    bias: "gentle-onramp",
  },
  {
    slug: "student-cs-undergrad",
    label: "CS undergraduate",
    // Python first because intro-CS curricula globally still skew Python; TS comes later as an
    // industry-readiness add-on (handled via STORY-046 daily/weekly plan).
    recommended_track_slugs: ["python-fundamentals"],
    recommended_daily_minutes: 30,
    bias: "standard",
  },
];

// Defensive parse-once at module load — turns a malformed entry above into a load-time error
// rather than a silent runtime bug. The Zod check is cheap (7 entries) and the resulting
// `RoleLibrary` is frozen so consumers can't mutate it.
export const ROLE_LIBRARY: RoleLibrary = Object.freeze(
  RoleLibrarySchema.parse(RAW_LIBRARY).map((r) => Object.freeze(r)),
) as RoleLibrary;

/**
 * Case-insensitive lookup against the role library by slug OR label. Returns `null` when no role
 * matches. The free-text `target_role` captured by STORY-053 may be either form — the LLM
 * onboarding agent tends to write the slug, the deterministic fallback (STORY-053 AC #6) writes
 * the user's free-text reply which is usually the label. STORY-067 — both must resolve.
 *
 * Free choice, no soft-locks: a `null` return is the "we have nothing tailored for you" signal —
 * the /recommended page redirects to /dashboard so the user keeps moving.
 */
export function getRecommendation(library: RoleLibrary, target_role: string): Role | null {
  const needle = target_role.trim().toLowerCase();
  if (!needle) return null;
  // Slug match wins (defensive — labels can theoretically shadow other slugs).
  const bySlug = library.find((r) => r.slug.toLowerCase() === needle);
  if (bySlug) return bySlug;
  return library.find((r) => r.label.toLowerCase() === needle) ?? null;
}
