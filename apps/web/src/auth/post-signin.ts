import { countUserEpisodes, getProfileTargetRole, type Profile } from "@learnpro/db";
import { getRecommendation, ROLE_LIBRARY } from "@learnpro/profile";
import { getAuthDb } from "./db.js";

// STORY-021 — first-login routing extends the STORY-005 rule.
// STORY-066 — also guard against the `/dashboard` ↔ `/recommended` redirect loop for
// `target_role` values the library doesn't recognize.
//
//   no profile / target_role null            → /onboarding   (still pre-onboarded)
//   target_role NOT recognized by library    → /dashboard    (no recommendation exists; sending
//                                                              to /recommended would 307 right
//                                                              back to /dashboard, looping)
//   target_role recognized + 0 episodes      → /recommended  (just-onboarded → show role-mapped
//                                                              tracks)
//   target_role recognized + ≥1 episode      → /dashboard    (returning user — skip past
//                                                              /recommended)
//
// Free choice, no soft-locks (AC #3): /recommended itself just renders the suggestion + a
// "Take me to the dashboard" link. Returning users never see it again because the count guard
// flips the destination at the very next sign-in.
export interface PostSigninInputs {
  profile: Pick<Profile, "target_role"> | null | undefined;
  episodeCount: number;
}

export function destinationFor(input: PostSigninInputs | null | undefined): string;
// Back-compat overload: pre-STORY-021 callers passed just a profile-shape object. The dashboard
// route still uses this overload as a defensive guard. New callers should use the inputs shape.
export function destinationFor(profile: Pick<Profile, "target_role"> | null | undefined): string;
export function destinationFor(arg: unknown): string {
  if (!arg) return "/onboarding";
  // Disambiguate: PostSigninInputs has both `profile` and `episodeCount`. The legacy shape only
  // has `target_role`. Pre-STORY-021 callers go down the second path with episodeCount inferred
  // as ≥1 — meaning a fully-onboarded user with the legacy call shape always gets /dashboard,
  // matching pre-STORY-021 behaviour.
  if (typeof arg === "object" && "episodeCount" in arg && "profile" in arg) {
    const inputs = arg as PostSigninInputs;
    if (!inputs.profile) return "/onboarding";
    if (!inputs.profile.target_role) return "/onboarding";
    if (inputs.episodeCount > 0) return "/dashboard";
    // STORY-066 — only route to /recommended when the role library actually has a recommendation
    // for this target_role. Otherwise /recommended would 307 back to /dashboard, which would
    // 307 us right back here, looping the browser until it gives up with ERR_TOO_MANY_REDIRECTS.
    const role = getRecommendation(ROLE_LIBRARY, inputs.profile.target_role);
    return role ? "/recommended" : "/dashboard";
  }
  const profile = arg as Pick<Profile, "target_role"> | null | undefined;
  if (!profile) return "/onboarding";
  return profile.target_role ? "/dashboard" : "/onboarding";
}

export async function destinationForUser(user_id: string): Promise<string> {
  const db = getAuthDb();
  const [profile, episodeCount] = await Promise.all([
    getProfileTargetRole(db, user_id),
    countUserEpisodes(db, user_id),
  ]);
  return destinationFor({ profile, episodeCount });
}
