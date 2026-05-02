import { describe, expect, it } from "vitest";
import { ONBOARDING_PROMPT_VERSION, ONBOARDING_SYSTEM_PROMPT } from "./index.js";

describe("ONBOARDING_SYSTEM_PROMPT", () => {
  it("names all five profile fields the agent should capture", () => {
    for (const field of [
      "target_role",
      "time_budget_min",
      "primary_goal",
      "self_assessed_level",
      "language_comfort",
    ]) {
      expect(ONBOARDING_SYSTEM_PROMPT).toContain(field);
    }
  });

  it("specifies the JSON output shape so the API can structurally parse turns", () => {
    for (const key of ["assistant_message", "captured", "done"]) {
      expect(ONBOARDING_SYSTEM_PROMPT).toContain(key);
    }
  });

  it("calls out the warm-coach tone + graceful exit policy (skip / later / start now)", () => {
    expect(ONBOARDING_SYSTEM_PROMPT.toLowerCase()).toContain("warm");
    expect(ONBOARDING_SYSTEM_PROMPT.toLowerCase()).toContain("skip");
    expect(ONBOARDING_SYSTEM_PROMPT).toMatch(/done\s*=\s*true/);
  });

  it("constrains language_comfort levels to the three values the schema accepts", () => {
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('"comfortable"');
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('"rusty"');
    expect(ONBOARDING_SYSTEM_PROMPT).toContain('"new"');
  });
});

describe("ONBOARDING_PROMPT_VERSION", () => {
  it("is a stable, dated identifier so cost telemetry can trace prompt edits", () => {
    expect(ONBOARDING_PROMPT_VERSION).toMatch(/^onboarding-\d{4}-\d{2}-\d{2}$/);
  });
});
