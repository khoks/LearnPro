import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { LearnProDb } from "./client.js";
import { profiles, SELF_HOSTED_ORG_ID, users } from "./schema.js";

// STORY-045 — DB helpers for email digest opt-ins + per-user unsubscribe token. Mirrors the
// shape of `quiet-hours.ts`: a get for the settings GET route, a partial UPSERT for the PUT
// route, plus a token-lookup used by the public `/v1/email/unsubscribe` route.
//
// The token is generated lazily on first opt-in. Once present it stays stable across opt-out /
// re-opt-in cycles so the same unsubscribe URL keeps working when copied from an old email.

export const EmailDigestPrefsSchema = z.object({
  daily_opt_in: z.boolean(),
  weekly_opt_in: z.boolean(),
  // ISO 8601 day-of-week: 1=Monday … 7=Sunday.
  weekly_day_of_week: z.number().int().min(1).max(7),
});
export type EmailDigestPrefs = z.infer<typeof EmailDigestPrefsSchema>;

export const DEFAULT_EMAIL_DIGEST_PREFS: EmailDigestPrefs = {
  daily_opt_in: false,
  weekly_opt_in: false,
  weekly_day_of_week: 1,
};

export interface EmailDigestPrefsWithToken extends EmailDigestPrefs {
  // Stable per-user token. Null until the first opt-in writes one.
  unsubscribe_token: string | null;
}

export async function getEmailDigestPrefs(
  db: LearnProDb,
  user_id: string,
): Promise<EmailDigestPrefsWithToken> {
  const rows = await db
    .select({
      daily_opt_in: profiles.email_daily_opt_in,
      weekly_opt_in: profiles.email_weekly_opt_in,
      weekly_day_of_week: profiles.email_weekly_day_of_week,
      unsubscribe_token: profiles.email_unsubscribe_token,
    })
    .from(profiles)
    .where(eq(profiles.user_id, user_id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { ...DEFAULT_EMAIL_DIGEST_PREFS, unsubscribe_token: null };
  }
  return {
    daily_opt_in: row.daily_opt_in,
    weekly_opt_in: row.weekly_opt_in,
    weekly_day_of_week: row.weekly_day_of_week,
    unsubscribe_token: row.unsubscribe_token,
  };
}

export interface UpdateEmailDigestPrefsOptions {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
  prefs: EmailDigestPrefs;
  // Test seam — tests inject a deterministic token generator. Production uses crypto random hex.
  generateToken?: () => string;
}

// Partial UPSERT mirroring `updateQuietHoursConfig`. Lazy-mints the unsubscribe token the first
// time any opt-in flips on; subsequent updates reuse the existing token. Idempotent on the
// no-row case via ON CONFLICT DO NOTHING + a follow-up UPDATE.
export async function updateEmailDigestPrefs(
  opts: UpdateEmailDigestPrefsOptions,
): Promise<EmailDigestPrefsWithToken> {
  const generate = opts.generateToken ?? defaultGenerateToken;
  const existing = await getEmailDigestPrefs(opts.db, opts.user_id);
  const anyOptIn = opts.prefs.daily_opt_in || opts.prefs.weekly_opt_in;
  const nextToken = existing.unsubscribe_token ?? (anyOptIn ? generate() : null);

  const setMap = {
    email_daily_opt_in: opts.prefs.daily_opt_in,
    email_weekly_opt_in: opts.prefs.weekly_opt_in,
    email_weekly_day_of_week: opts.prefs.weekly_day_of_week,
    email_unsubscribe_token: nextToken,
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
        email_daily_opt_in: opts.prefs.daily_opt_in,
        email_weekly_opt_in: opts.prefs.weekly_opt_in,
        email_weekly_day_of_week: opts.prefs.weekly_day_of_week,
        email_unsubscribe_token: nextToken,
      })
      .onConflictDoNothing();
    await opts.db.update(profiles).set(setMap).where(eq(profiles.user_id, opts.user_id));
  }

  return {
    daily_opt_in: opts.prefs.daily_opt_in,
    weekly_opt_in: opts.prefs.weekly_opt_in,
    weekly_day_of_week: opts.prefs.weekly_day_of_week,
    unsubscribe_token: nextToken,
  };
}

export interface UnsubscribeUserResult {
  found: boolean;
  user_id: string | null;
}

// Token-driven unsubscribe — flips both opt-ins to false. Returns `found: false` for an unknown
// token so the public route can render a friendly "already unsubscribed / link expired" page
// without leaking whether the token ever existed.
export async function unsubscribeByToken(
  db: LearnProDb,
  token: string,
): Promise<UnsubscribeUserResult> {
  if (!token) return { found: false, user_id: null };
  const rows = await db
    .select({ user_id: profiles.user_id })
    .from(profiles)
    .where(eq(profiles.email_unsubscribe_token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return { found: false, user_id: null };

  await db
    .update(profiles)
    .set({
      email_daily_opt_in: false,
      email_weekly_opt_in: false,
      updated_at: new Date(),
    })
    .where(eq(profiles.user_id, row.user_id));
  return { found: true, user_id: row.user_id };
}

// Lists every user opted-in to a given digest variant, with the email + unsubscribe token the
// digest needs to render its copy. Used by the daily-digest extension to the existing daily
// reminder cron and the new weekly-digest cron.
export interface DigestRecipient {
  user_id: string;
  email: string;
  unsubscribe_token: string;
  weekly_day_of_week: number;
}

export async function listDigestRecipients(
  db: LearnProDb,
  variant: "daily" | "weekly",
): Promise<DigestRecipient[]> {
  const optInColumn =
    variant === "daily" ? profiles.email_daily_opt_in : profiles.email_weekly_opt_in;
  const rows = await db
    .select({
      user_id: profiles.user_id,
      email: users.email,
      unsubscribe_token: profiles.email_unsubscribe_token,
      weekly_day_of_week: profiles.email_weekly_day_of_week,
    })
    .from(profiles)
    .innerJoin(users, eq(profiles.user_id, users.id))
    .where(eq(optInColumn, true));
  return rows
    .filter((r): r is DigestRecipient => r.unsubscribe_token !== null)
    .map((r) => ({
      user_id: r.user_id,
      email: r.email,
      unsubscribe_token: r.unsubscribe_token,
      weekly_day_of_week: r.weekly_day_of_week,
    }));
}

function defaultGenerateToken(): string {
  return randomBytes(32).toString("hex");
}
