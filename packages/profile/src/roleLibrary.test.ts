import { describe, expect, it } from "vitest";
import {
  ROLE_LIBRARY,
  RoleLibrarySchema,
  RoleSchema,
  getRecommendation,
  type RoleLibrary,
} from "./roleLibrary.js";

describe("ROLE_LIBRARY (STORY-021)", () => {
  it("parses cleanly against RoleLibrarySchema", () => {
    expect(() => RoleLibrarySchema.parse(ROLE_LIBRARY)).not.toThrow();
  });

  it("ships at least 5 hardcoded roles for MVP (per spec)", () => {
    expect(ROLE_LIBRARY.length).toBeGreaterThanOrEqual(5);
  });

  it("never exceeds the MVP cap of 7 roles (per spec)", () => {
    expect(ROLE_LIBRARY.length).toBeLessThanOrEqual(7);
  });

  it("has unique slugs across the library", () => {
    const slugs = ROLE_LIBRARY.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each([
    ["backend-engineer", 45, "standard"],
    ["frontend-engineer", 45, "standard"],
    ["full-stack-engineer", 45, "standard"],
    ["ml-engineer", 60, "math-heavy"],
    ["data-scientist", 45, "standard"],
    ["career-switcher-from-data-analyst", 30, "gentle-onramp"],
    ["student-cs-undergrad", 30, "standard"],
  ])("ships role %s with %d daily minutes and bias=%s", (slug, minutes, bias) => {
    const role = ROLE_LIBRARY.find((r) => r.slug === slug);
    expect(role, `role ${slug} not found`).toBeDefined();
    expect(role?.recommended_daily_minutes).toBe(minutes);
    expect(role?.bias).toBe(bias);
    expect(role?.recommended_track_slugs.length).toBeGreaterThan(0);
  });

  it("backend-engineer recommends both python and typescript starting tracks", () => {
    const role = ROLE_LIBRARY.find((r) => r.slug === "backend-engineer");
    expect(role?.recommended_track_slugs).toEqual([
      "python-fundamentals",
      "typescript-fundamentals",
    ]);
  });

  it("full-stack-engineer recommends typescript-first, then python", () => {
    const role = ROLE_LIBRARY.find((r) => r.slug === "full-stack-engineer");
    expect(role?.recommended_track_slugs).toEqual([
      "typescript-fundamentals",
      "python-fundamentals",
    ]);
  });

  it("frontend-engineer recommends only typescript", () => {
    const role = ROLE_LIBRARY.find((r) => r.slug === "frontend-engineer");
    expect(role?.recommended_track_slugs).toEqual(["typescript-fundamentals"]);
  });

  it("ml-engineer routes through python for MVP (DL tracks land in v3)", () => {
    const role = ROLE_LIBRARY.find((r) => r.slug === "ml-engineer");
    expect(role?.recommended_track_slugs).toEqual(["python-fundamentals"]);
  });

  it("freezes role entries so callers can't mutate the library at runtime", () => {
    const role = ROLE_LIBRARY[0];
    expect(role).toBeDefined();
    expect(() => {
      // @ts-expect-error — runtime check that Object.freeze() is in effect
      role.recommended_daily_minutes = 999;
    }).toThrow();
  });
});

describe("getRecommendation (STORY-021)", () => {
  it("returns the role for an exact slug match", () => {
    const out = getRecommendation(ROLE_LIBRARY, "backend-engineer");
    expect(out?.slug).toBe("backend-engineer");
    expect(out?.label).toBe("Backend engineer");
  });

  it("looks up case-insensitively", () => {
    const out = getRecommendation(ROLE_LIBRARY, "Backend-Engineer");
    expect(out?.slug).toBe("backend-engineer");
  });

  it("trims surrounding whitespace before matching", () => {
    const out = getRecommendation(ROLE_LIBRARY, "  ml-engineer  ");
    expect(out?.slug).toBe("ml-engineer");
  });

  it("matches uppercase input", () => {
    const out = getRecommendation(ROLE_LIBRARY, "STUDENT-CS-UNDERGRAD");
    expect(out?.slug).toBe("student-cs-undergrad");
  });

  it("returns null on an unknown slug", () => {
    expect(getRecommendation(ROLE_LIBRARY, "astronaut")).toBeNull();
  });

  it("returns null on an empty input string", () => {
    expect(getRecommendation(ROLE_LIBRARY, "")).toBeNull();
  });

  it("returns null on a whitespace-only input string (after trim)", () => {
    expect(getRecommendation(ROLE_LIBRARY, "   ")).toBeNull();
  });

  it("returns null on a near-miss that isn't a real slug (no fuzzy matching)", () => {
    // Free choice, no soft-locks: we don't guess. An unknown role just falls back to /dashboard.
    expect(getRecommendation(ROLE_LIBRARY, "frontend-engr")).toBeNull();
  });

  it("supports a custom (test) library — pure helper, no implicit dependency", () => {
    const custom: RoleLibrary = [
      {
        slug: "test-role",
        label: "Test role",
        recommended_track_slugs: ["python-fundamentals"],
        recommended_daily_minutes: 15,
        bias: "standard",
      },
    ];
    expect(getRecommendation(custom, "test-role")?.label).toBe("Test role");
    expect(getRecommendation(custom, "backend-engineer")).toBeNull();
  });

  // STORY-067 — the deterministic onboarding fallback writes the user's free-text reply, which
  // is usually the label form (e.g. "Backend engineer"), not the slug form. Match both so a
  // self-hoster without an API key doesn't get stuck with `role: null` from /api/recommendation.
  it("returns the role for an exact label match (STORY-067)", () => {
    const out = getRecommendation(ROLE_LIBRARY, "Backend engineer");
    expect(out?.slug).toBe("backend-engineer");
    expect(out?.label).toBe("Backend engineer");
  });

  it("matches the label case-insensitively (STORY-067)", () => {
    expect(getRecommendation(ROLE_LIBRARY, "FRONTEND ENGINEER")?.slug).toBe("frontend-engineer");
    expect(getRecommendation(ROLE_LIBRARY, "backend engineer")?.slug).toBe("backend-engineer");
  });

  it("trims surrounding whitespace before label matching (STORY-067)", () => {
    expect(getRecommendation(ROLE_LIBRARY, "  ML engineer  ")?.slug).toBe("ml-engineer");
  });

  it("slug match wins when a slug and label both could match (defensive, STORY-067)", () => {
    // Pathological library where one role's slug = another role's label (lowercased).
    const custom: RoleLibrary = [
      {
        slug: "x",
        label: "Right one",
        recommended_track_slugs: ["python-fundamentals"],
        recommended_daily_minutes: 10,
        bias: "standard",
      },
      {
        slug: "should-not-win",
        // Label happens to equal the first role's slug — shouldn't shadow it.
        label: "x",
        recommended_track_slugs: ["python-fundamentals"],
        recommended_daily_minutes: 10,
        bias: "standard",
      },
    ];
    expect(getRecommendation(custom, "x")?.label).toBe("Right one");
  });

  it("returns null on text that's neither a slug nor a label (STORY-067)", () => {
    expect(getRecommendation(ROLE_LIBRARY, "Quantum researcher")).toBeNull();
  });
});

describe("RoleSchema (STORY-021)", () => {
  it("rejects roles with empty track lists", () => {
    expect(() =>
      RoleSchema.parse({
        slug: "x",
        label: "X",
        recommended_track_slugs: [],
        recommended_daily_minutes: 30,
        bias: "standard",
      }),
    ).toThrow();
  });

  it("rejects negative or zero daily minutes", () => {
    expect(() =>
      RoleSchema.parse({
        slug: "x",
        label: "X",
        recommended_track_slugs: ["python-fundamentals"],
        recommended_daily_minutes: 0,
        bias: "standard",
      }),
    ).toThrow();
  });

  it("rejects unknown bias enum values", () => {
    expect(() =>
      RoleSchema.parse({
        slug: "x",
        label: "X",
        recommended_track_slugs: ["python-fundamentals"],
        recommended_daily_minutes: 30,
        bias: "frantic",
      }),
    ).toThrow();
  });

  it("rejects non-kebab slugs", () => {
    expect(() =>
      RoleSchema.parse({
        slug: "Backend Engineer",
        label: "X",
        recommended_track_slugs: ["python-fundamentals"],
        recommended_daily_minutes: 30,
        bias: "standard",
      }),
    ).toThrow();
  });
});
