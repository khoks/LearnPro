import { eq } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { profiles, SELF_HOSTED_ORG_ID } from "./schema.js";

export interface BootstrapProfileOptions {
  db: LearnProDb;
  user_id: string;
  org_id?: string;
}

// Idempotently inserts an empty profile row for a freshly-signed-in user. All optional fields stay
// null until the conversational onboarding agent (STORY-053) populates them. `ON CONFLICT DO NOTHING`
// makes this safe to call on every login — only the first call writes.
export async function bootstrapProfile(opts: BootstrapProfileOptions): Promise<void> {
  await opts.db
    .insert(profiles)
    .values({
      user_id: opts.user_id,
      org_id: opts.org_id ?? SELF_HOSTED_ORG_ID,
    })
    .onConflictDoNothing();
}

// Reads just enough of the profile to decide post-signin routing: whether onboarding is complete.
// Returns `null` when no profile exists yet (brand-new user before bootstrap has run, or rare
// race). Lives in @learnpro/db so apps/web doesn't need to depend on drizzle-orm directly.
export async function getProfileTargetRole(
  db: LearnProDb,
  user_id: string,
): Promise<{ target_role: string | null } | null> {
  const rows = await db
    .select({ target_role: profiles.target_role })
    .from(profiles)
    .where(eq(profiles.user_id, user_id))
    .limit(1);
  return rows[0] ?? null;
}
