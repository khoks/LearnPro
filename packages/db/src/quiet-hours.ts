import { DEFAULT_QUIET_HOURS_CONFIG, type QuietHoursConfig } from "@learnpro/scoring";
import { eq } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { profiles, SELF_HOSTED_ORG_ID } from "./schema.js";

// STORY-024 — DB helpers for the quiet-hours config that lives on the `profiles` row. The
// dispatcher's `getQuietHoursConfig` callback hits `getQuietHoursConfig` per-dispatch; the
// settings PUT route persists via `updateQuietHoursConfig`.
//
// Both helpers fall back to `DEFAULT_QUIET_HOURS_CONFIG` when no profile row exists yet — a
// brand-new user can still receive (or defer) notifications before they finish onboarding.

export interface UpdateQuietHoursConfigOptions {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
  config: QuietHoursConfig;
}

export async function getQuietHoursConfig(
  db: LearnProDb,
  user_id: string,
): Promise<QuietHoursConfig> {
  const rows = await db
    .select({
      enabled: profiles.quiet_hours_enabled,
      start_min: profiles.quiet_hours_start_min,
      end_min: profiles.quiet_hours_end_min,
      timezone: profiles.timezone,
    })
    .from(profiles)
    .where(eq(profiles.user_id, user_id))
    .limit(1);
  const row = rows[0];
  if (!row) return DEFAULT_QUIET_HOURS_CONFIG;
  return {
    enabled: row.enabled,
    start_min: row.start_min,
    end_min: row.end_min,
    timezone: row.timezone,
  };
}

// Partial UPSERT: writes the four quiet-hours columns on an existing row, or inserts a fresh
// `profiles` row keyed on user_id when none exists. Mirrors the pattern in `updateProfileFields`.
export async function updateQuietHoursConfig(opts: UpdateQuietHoursConfigOptions): Promise<void> {
  const setMap = {
    quiet_hours_enabled: opts.config.enabled,
    quiet_hours_start_min: opts.config.start_min,
    quiet_hours_end_min: opts.config.end_min,
    timezone: opts.config.timezone,
    updated_at: new Date(),
  } as const;
  const updated = await opts.db
    .update(profiles)
    .set(setMap)
    .where(eq(profiles.user_id, opts.user_id))
    .returning({ user_id: profiles.user_id });
  if (updated.length > 0) return;

  // No row yet — insert one with the supplied config. ON CONFLICT DO NOTHING handles the race
  // where bootstrap and the settings save land at the same time. Retry the UPDATE so the saved
  // values still land in that case.
  await opts.db
    .insert(profiles)
    .values({
      user_id: opts.user_id,
      org_id: opts.org_id ?? SELF_HOSTED_ORG_ID,
      quiet_hours_enabled: opts.config.enabled,
      quiet_hours_start_min: opts.config.start_min,
      quiet_hours_end_min: opts.config.end_min,
      timezone: opts.config.timezone,
    })
    .onConflictDoNothing();
  await opts.db
    .update(profiles)
    .set(setMap)
    .where(eq(profiles.user_id, opts.user_id))
    .returning({ user_id: profiles.user_id });
}
