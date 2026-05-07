import { eq } from "drizzle-orm";
import { z } from "zod";
import type { LearnProDb } from "./client.js";
import { profiles, SELF_HOSTED_ORG_ID } from "./schema.js";

// STORY-036 — DB helpers for the per-user tutor_mode toggle. Mirrors the shape of
// `quiet-hours.ts` / `email-digest-prefs.ts`: a get for the settings GET route, a partial
// UPSERT for the PUT route. Default is `cloud` so the column behaves as if it were unset for
// users who never visit the settings page.

export const TutorModeSchema = z.enum(["cloud", "local", "auto-fallback"]);
export type TutorMode = z.infer<typeof TutorModeSchema>;

export const TutorModeSettingsSchema = z.object({
  mode: TutorModeSchema,
  ollama_base_url: z.string().url().max(512).optional(),
  ollama_model: z.string().min(1).max(128).optional(),
});
export type TutorModeSettings = z.infer<typeof TutorModeSettingsSchema>;

export const DEFAULT_TUTOR_MODE: TutorMode = "cloud";

export async function getTutorMode(db: LearnProDb, user_id: string): Promise<TutorMode> {
  const rows = await db
    .select({ tutor_mode: profiles.tutor_mode })
    .from(profiles)
    .where(eq(profiles.user_id, user_id))
    .limit(1);
  const row = rows[0];
  if (!row) return DEFAULT_TUTOR_MODE;
  const parsed = TutorModeSchema.safeParse(row.tutor_mode);
  return parsed.success ? parsed.data : DEFAULT_TUTOR_MODE;
}

export interface UpdateTutorModeOptions {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
  mode: TutorMode;
}

export async function updateTutorMode(opts: UpdateTutorModeOptions): Promise<TutorMode> {
  const setMap = {
    tutor_mode: opts.mode,
    updated_at: new Date(),
  } as const;

  const updated = await opts.db
    .update(profiles)
    .set(setMap)
    .where(eq(profiles.user_id, opts.user_id))
    .returning({ user_id: profiles.user_id });

  if (updated.length === 0) {
    await opts.db
      .insert(profiles)
      .values({
        user_id: opts.user_id,
        org_id: opts.org_id ?? SELF_HOSTED_ORG_ID,
        tutor_mode: opts.mode,
      })
      .onConflictDoNothing();
    await opts.db.update(profiles).set(setMap).where(eq(profiles.user_id, opts.user_id));
  }

  return opts.mode;
}
