import { describe, expect, it } from "vitest";
import {
  MAX_ONBOARDING_TOKENS,
  MAX_ONBOARDING_TURNS,
  OnboardingMessageSchema,
  OnboardingTurnRequestSchema,
  OnboardingTurnResponseSchema,
  ProfileFieldUpdatesSchema,
} from "./onboarding.js";

describe("OnboardingMessageSchema", () => {
  it("accepts an assistant message", () => {
    const m = OnboardingMessageSchema.parse({ role: "assistant", content: "Hello there." });
    expect(m.role).toBe("assistant");
  });

  it("accepts a user message", () => {
    const m = OnboardingMessageSchema.parse({ role: "user", content: "I want to be an SWE." });
    expect(m.role).toBe("user");
  });

  it("rejects an unknown role (discriminator guard)", () => {
    const r = OnboardingMessageSchema.safeParse({ role: "system", content: "ignored" });
    expect(r.success).toBe(false);
  });

  it("rejects empty content", () => {
    const r = OnboardingMessageSchema.safeParse({ role: "assistant", content: "" });
    expect(r.success).toBe(false);
  });
});

describe("ProfileFieldUpdatesSchema (partial)", () => {
  it("accepts a fully-empty update (no fields captured this turn)", () => {
    const r = ProfileFieldUpdatesSchema.parse({});
    expect(r).toEqual({});
  });

  it("accepts a partial update (only target_role)", () => {
    const r = ProfileFieldUpdatesSchema.parse({ target_role: "swe_intern" });
    expect(r.target_role).toBe("swe_intern");
    expect(r.time_budget_min).toBeUndefined();
  });

  it("accepts explicit nulls (caller signaling 'no answer this turn' for a field)", () => {
    const r = ProfileFieldUpdatesSchema.parse({ target_role: null, time_budget_min: null });
    expect(r.target_role).toBeNull();
    expect(r.time_budget_min).toBeNull();
  });

  it("accepts a language_comfort jsonb shape with the 3 levels", () => {
    const r = ProfileFieldUpdatesSchema.parse({
      language_comfort: { python: "comfortable", typescript: "rusty", rust: "new" },
    });
    expect(r.language_comfort?.python).toBe("comfortable");
  });

  it("rejects an unknown language_comfort level", () => {
    const r = ProfileFieldUpdatesSchema.safeParse({
      language_comfort: { python: "expert" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects time_budget_min < 1 or > 24h", () => {
    expect(ProfileFieldUpdatesSchema.safeParse({ time_budget_min: 0 }).success).toBe(false);
    expect(ProfileFieldUpdatesSchema.safeParse({ time_budget_min: 24 * 60 + 1 }).success).toBe(
      false,
    );
    expect(ProfileFieldUpdatesSchema.safeParse({ time_budget_min: 30 }).success).toBe(true);
  });
});

describe("OnboardingTurnRequestSchema", () => {
  it("accepts a non-empty conversation", () => {
    const r = OnboardingTurnRequestSchema.parse({
      messages: [
        { role: "assistant", content: "Hi! What role are you preparing for?" },
        { role: "user", content: "Backend SWE intern." },
      ],
    });
    expect(r.messages).toHaveLength(2);
  });

  it("rejects an empty messages array (have to send the seeded greeting at minimum)", () => {
    expect(OnboardingTurnRequestSchema.safeParse({ messages: [] }).success).toBe(false);
  });
});

describe("OnboardingTurnResponseSchema", () => {
  it("accepts a typical mid-conversation reply", () => {
    const r = OnboardingTurnResponseSchema.parse({
      assistant_message: "Great — how much time can you commit each day?",
      captured: { target_role: "swe_intern" },
      done: false,
    });
    expect(r.captured.target_role).toBe("swe_intern");
    expect(r.done).toBe(false);
  });

  it("accepts a `done: true` close-out with no captures", () => {
    const r = OnboardingTurnResponseSchema.parse({
      assistant_message: "All set — let's jump in.",
      captured: {},
      done: true,
    });
    expect(r.done).toBe(true);
  });

  it("rejects an empty assistant_message", () => {
    expect(
      OnboardingTurnResponseSchema.safeParse({
        assistant_message: "",
        captured: {},
        done: true,
      }).success,
    ).toBe(false);
  });
});

describe("Cap constants", () => {
  it("MAX_ONBOARDING_TURNS is 6 — leaves room for greeting + 5 follow-ups", () => {
    expect(MAX_ONBOARDING_TURNS).toBe(6);
  });

  it("MAX_ONBOARDING_TOKENS is 3000 — comfortable cap for Haiku x 6 turns", () => {
    expect(MAX_ONBOARDING_TOKENS).toBe(3000);
  });
});
