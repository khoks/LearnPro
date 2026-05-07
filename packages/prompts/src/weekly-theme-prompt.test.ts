import { describe, expect, it } from "vitest";
import {
  WEEKLY_THEME_PROMPT_VERSION,
  buildWeeklyThemeSystemPrompt,
  buildWeeklyThemeUserPrompt,
} from "./weekly-theme-prompt.js";

// STORY-046c — coach-voice forbidden-phrase test. The theme line shows up in the dashboard's
// weekly card so the system prompt must never normalize FOMO / streak shaming / fire imagery.
// The forbidden list mirrors the rest of the user-visible-copy enforcement (notifications,
// dashboard, today/weekly plans).
const FORBIDDEN_SUBSTRINGS = [
  "DON'T LOSE",
  "lose your streak",
  "fall behind",
  "DAY ",
  "🔥",
  "⚠️",
  "leaderboard",
  "you've got this",
  "level up",
  "fomo",
  "crush it",
  "beat the clock",
];

describe("WEEKLY_THEME_PROMPT_VERSION — STORY-046c", () => {
  it("is versioned with the v1 tag", () => {
    expect(WEEKLY_THEME_PROMPT_VERSION).toBe("weekly-theme-v1");
  });
});

describe("buildWeeklyThemeSystemPrompt — STORY-046c", () => {
  it("instructs the agent to keep the theme under 8 words", () => {
    const sys = buildWeeklyThemeSystemPrompt();
    expect(sys).toMatch(/8 words or fewer/i);
  });

  it("instructs the agent to keep the theme under 80 characters", () => {
    const sys = buildWeeklyThemeSystemPrompt();
    expect(sys).toMatch(/80 characters or fewer/i);
  });

  it("instructs the agent to speak like a calm tutor (coach voice)", () => {
    const sys = buildWeeklyThemeSystemPrompt();
    expect(sys.toLowerCase()).toContain("calm tutor");
  });

  it("specifies the JSON output schema", () => {
    const sys = buildWeeklyThemeSystemPrompt();
    expect(sys).toContain('"theme"');
  });

  it("explicitly forbids exclamation points + fire emoji + streak language", () => {
    const sys = buildWeeklyThemeSystemPrompt().toLowerCase();
    expect(sys).toContain("no exclamation");
    expect(sys).toContain("fire emoji");
    expect(sys).toContain("no streak");
  });

  it("explicitly forbids motivational filler", () => {
    const sys = buildWeeklyThemeSystemPrompt().toLowerCase();
    expect(sys).toContain("no motivational filler");
  });

  it("forbids second-person dares + all-caps imperatives", () => {
    const sys = buildWeeklyThemeSystemPrompt().toLowerCase();
    expect(sys).toContain("no second-person dares");
    expect(sys).toContain("no all-caps imperatives");
  });

  it("does not contain forbidden coach-voice phrases outside their explicit 'never use' rules", () => {
    const sys = buildWeeklyThemeSystemPrompt();
    const lowered = sys.toLowerCase();
    // Each forbidden phrase may legally appear once in a "Avoid" example or "no streak"
    // rule. The guard catches accidental tone drift if someone later edits the prompt and
    // accidentally seeds the model with phrases it should never produce. We allow at most
    // 2 occurrences per phrase (one in the rule, one in a counter-example).
    for (const phrase of FORBIDDEN_SUBSTRINGS) {
      const occurrences = lowered.split(phrase.toLowerCase()).length - 1;
      expect(
        occurrences,
        `forbidden phrase "${phrase}" appears ${occurrences} times — should appear at most twice (rule + counter-example)`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it("includes good and bad examples to anchor tone", () => {
    const sys = buildWeeklyThemeSystemPrompt();
    expect(sys).toContain("Good examples");
    expect(sys).toContain("Avoid examples");
  });
});

describe("buildWeeklyThemeUserPrompt — STORY-046c", () => {
  it("renders one row per concept with its name", () => {
    const out = buildWeeklyThemeUserPrompt({
      concepts: [
        { slug: "python.basics.list-comprehensions", name: "List comprehensions" },
        { slug: "python.basics.generators", name: "Generators" },
      ],
    });
    expect(out).toContain("List comprehensions");
    expect(out).toContain("Generators");
  });

  it("renders concept tags when present", () => {
    const out = buildWeeklyThemeUserPrompt({
      concepts: [
        {
          slug: "python.basics.dicts",
          name: "Dicts",
          tags: ["data-modeling", "fundamentals"],
        },
      ],
    });
    expect(out).toContain("Dicts");
    expect(out).toContain("tags: data-modeling, fundamentals");
  });

  it("includes the optional learner goal when supplied", () => {
    const out = buildWeeklyThemeUserPrompt({
      concepts: [{ slug: "x", name: "Variables" }],
      target_role: "backend-engineer",
    });
    expect(out).toContain("Optional learner goal: backend-engineer");
  });

  it("omits the goal block when target_role is null", () => {
    const out = buildWeeklyThemeUserPrompt({
      concepts: [{ slug: "x", name: "Variables" }],
      target_role: null,
    });
    expect(out).not.toContain("Optional learner goal");
  });

  it("omits the goal block when target_role is empty string", () => {
    const out = buildWeeklyThemeUserPrompt({
      concepts: [{ slug: "x", name: "Variables" }],
      target_role: "",
    });
    expect(out).not.toContain("Optional learner goal");
  });

  it("instructs the model to return strict JSON (no prose, no fences)", () => {
    const out = buildWeeklyThemeUserPrompt({
      concepts: [{ slug: "x", name: "Variables" }],
    });
    expect(out).toContain('{ "theme": string }');
    expect(out.toLowerCase()).toContain("no markdown fences");
  });
});
