import { describe, expect, it } from "vitest";
import { destinationFor } from "./post-signin.js";

describe("destinationFor (post-signin redirect rule)", () => {
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
