import { eq } from "drizzle-orm";
import { profiles, type Profile } from "@learnpro/db";
import { getAuthDb } from "./db.js";

// Pure routing rule: a profile is "onboarded" once `target_role` is non-null. Pre-onboarding users
// land on /onboarding (placeholder until STORY-053 ships the conversational agent); returning
// users land on /dashboard.
export function destinationFor(profile: Pick<Profile, "target_role"> | null | undefined): string {
  if (!profile) return "/onboarding";
  return profile.target_role ? "/dashboard" : "/onboarding";
}

export async function destinationForUser(user_id: string): Promise<string> {
  const rows = await getAuthDb()
    .db.select({ target_role: profiles.target_role })
    .from(profiles)
    .where(eq(profiles.user_id, user_id))
    .limit(1);
  return destinationFor(rows[0] ?? null);
}
