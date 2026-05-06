import { describe, expect, it } from "vitest";
import { destinationFor } from "./post-signin.js";

// STORY-021 expanded the routing rule. Old (pre-021) shape — pure profile object — is still
// supported so the dashboard's defensive recheck doesn't break.
describe("destinationFor — legacy single-arg form (pre-STORY-021 callers)", () => {
  it("sends a brand-new user (no profile row yet) to onboarding", () => {
    expect(destinationFor(null)).toBe("/onboarding");
    expect(destinationFor(undefined)).toBe("/onboarding");
  });

  it("sends a user whose profile exists but lacks target_role to onboarding", () => {
    expect(destinationFor({ target_role: null })).toBe("/onboarding");
  });

  it("sends a fully-onboarded user (target_role set) straight to the dashboard", () => {
    expect(destinationFor({ target_role: "swe_intern" })).toBe("/dashboard");
  });
});

// STORY-021 — the new path with episode count.
describe("destinationFor — STORY-021 first-login routing", () => {
  it("sends a no-profile user to /onboarding regardless of episode count", () => {
    expect(destinationFor({ profile: null, episodeCount: 0 })).toBe("/onboarding");
    expect(destinationFor({ profile: null, episodeCount: 5 })).toBe("/onboarding");
  });

  it("sends a target_role-null profile to /onboarding regardless of episode count", () => {
    expect(destinationFor({ profile: { target_role: null }, episodeCount: 0 })).toBe("/onboarding");
    expect(destinationFor({ profile: { target_role: null }, episodeCount: 3 })).toBe("/onboarding");
  });

  it("sends a just-onboarded user (target_role set + 0 episodes) to /recommended", () => {
    expect(destinationFor({ profile: { target_role: "backend-engineer" }, episodeCount: 0 })).toBe(
      "/recommended",
    );
  });

  it("sends a returning user (target_role set + ≥1 episode) to /dashboard", () => {
    expect(destinationFor({ profile: { target_role: "backend-engineer" }, episodeCount: 1 })).toBe(
      "/dashboard",
    );
    expect(destinationFor({ profile: { target_role: "ml-engineer" }, episodeCount: 47 })).toBe(
      "/dashboard",
    );
  });

  it("flips back to /dashboard the moment the user starts their first episode", () => {
    // Walk the boundary: 0 → /recommended; 1 → /dashboard.
    const profile = { target_role: "frontend-engineer" };
    expect(destinationFor({ profile, episodeCount: 0 })).toBe("/recommended");
    expect(destinationFor({ profile, episodeCount: 1 })).toBe("/dashboard");
  });

  it("respects unknown target_role values too — destination is /recommended (the page falls back)", () => {
    // The post-signin rule is just about *whether* a target_role exists. The /recommended page
    // itself queries the API and redirects to /dashboard if the role is unknown to the library.
    // This keeps the rule simple and lets the page own the recommendation lookup.
    expect(destinationFor({ profile: { target_role: "astronaut-trainee" }, episodeCount: 0 })).toBe(
      "/recommended",
    );
  });
});
