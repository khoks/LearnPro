import { eq } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { profiles, SELF_HOSTED_ORG_ID } from "./schema.js";

// Subset of `profiles` columns the conversational onboarding agent (STORY-053) writes per turn.
// Mirrors `ProfileFieldUpdates` in @learnpro/shared but stays in @learnpro/db so the package
// boundary doesn't leak Drizzle types upward and so callers without @learnpro/shared can still
// use it. The two shapes are kept in sync by the API endpoint that bridges them.
export interface ProfileFieldUpdatesInput {
  target_role?: string | null;
  time_budget_min?: number | null;
  primary_goal?: string | null;
  self_assessed_level?: string | null;
  language_comfort?: Record<string, string> | null;
}

export interface UpdateProfileFieldsOptions {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
  updates: ProfileFieldUpdatesInput;
}

// Applies a partial update to the profile row. Skips fields that are `undefined` so a turn that
// only captured target_role doesn't clobber a previously-captured time_budget_min. Explicit
// `null` is also skipped — onboarding never *clears* a prior write; it only fills in blanks.
//
// Idempotent: if the profile row doesn't exist yet (a brand-new user whose Auth.js signIn event
// hasn't bootstrapped the row), we INSERT with the supplied fields. Otherwise we UPDATE only
// the supplied non-null columns. The `updated_at` timestamp is bumped on every effective write.
//
// Returns true if any column was changed, false if the update was a no-op (all undefined/null).
export async function updateProfileFields(opts: UpdateProfileFieldsOptions): Promise<boolean> {
  const setMap = buildSet(opts.updates);
  if (Object.keys(setMap).length === 0) return false;

  // Try UPDATE first — the common path post-bootstrap.
  const updated = await opts.db
    .update(profiles)
    .set({ ...setMap, updated_at: new Date() })
    .where(eq(profiles.user_id, opts.user_id))
    .returning({ user_id: profiles.user_id });
  if (updated.length > 0) return true;

  // No row yet — insert one with whatever we have. ON CONFLICT DO NOTHING handles the race where
  // bootstrap and an early agent reply land at the same time. If we lose the race, retry the
  // UPDATE so the agent's captures still land.
  await opts.db
    .insert(profiles)
    .values({
      user_id: opts.user_id,
      org_id: opts.org_id ?? SELF_HOSTED_ORG_ID,
      ...setMap,
    })
    .onConflictDoNothing();
  const retried = await opts.db
    .update(profiles)
    .set({ ...setMap, updated_at: new Date() })
    .where(eq(profiles.user_id, opts.user_id))
    .returning({ user_id: profiles.user_id });
  return retried.length > 0;
}

function buildSet(updates: ProfileFieldUpdatesInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (updates.target_role !== undefined && updates.target_role !== null) {
    out["target_role"] = updates.target_role;
  }
  if (updates.time_budget_min !== undefined && updates.time_budget_min !== null) {
    out["time_budget_min"] = updates.time_budget_min;
  }
  if (updates.primary_goal !== undefined && updates.primary_goal !== null) {
    out["primary_goal"] = updates.primary_goal;
  }
  if (updates.self_assessed_level !== undefined && updates.self_assessed_level !== null) {
    out["self_assessed_level"] = updates.self_assessed_level;
  }
  if (updates.language_comfort !== undefined && updates.language_comfort !== null) {
    out["language_comfort"] = updates.language_comfort;
  }
  return out;
}
