import { getProfileTargetRole, type Profile } from "@learnpro/db";
import { getAuthDb } from "./db.js";

// Pure routing rule: a profile is "onboarded" once `target_role` is non-null. Pre-onboarding users
// land on /onboarding (placeholder until STORY-053 ships the conversational agent); returning
// users land on /dashboard.
export function destinationFor(profile: Pick<Profile, "target_role"> | null | undefined): string {
  if (!profile) return "/onboarding";
  return profile.target_role ? "/dashboard" : "/onboarding";
}

export async function destinationForUser(user_id: string): Promise<string> {
  const profile = await getProfileTargetRole(getAuthDb(), user_id);
  return destinationFor(profile);
}
