import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_HAIKU,
  ANTHROPIC_OPUS,
  DEFAULT_ROLE_MODEL_MAP,
  modelForRole,
  resolveModel,
} from "./models.js";

describe("modelForRole", () => {
  it("maps heavyweight roles to Opus", () => {
    expect(modelForRole("tutor")).toBe(ANTHROPIC_OPUS);
    expect(modelForRole("interviewer")).toBe(ANTHROPIC_OPUS);
    expect(modelForRole("reflection")).toBe(ANTHROPIC_OPUS);
  });

  it("maps cheap routing roles to Haiku", () => {
    expect(modelForRole("grader")).toBe(ANTHROPIC_HAIKU);
    expect(modelForRole("router")).toBe(ANTHROPIC_HAIKU);
  });

  it("respects an operator-injected role map", () => {
    const map = { ...DEFAULT_ROLE_MODEL_MAP, tutor: "claude-opus-4-7-preview" };
    expect(modelForRole("tutor", map)).toBe("claude-opus-4-7-preview");
  });
});

describe("resolveModel", () => {
  it("prefers explicit model over role", () => {
    expect(resolveModel({ explicit: "x", role: "tutor" })).toBe("x");
  });

  it("falls back to role mapping when no explicit model", () => {
    expect(resolveModel({ role: "tutor" })).toBe(ANTHROPIC_OPUS);
  });

  it("falls back to the fallback string when no role", () => {
    expect(resolveModel({ fallback: "fb" })).toBe("fb");
  });

  it("defaults to Haiku when nothing supplied", () => {
    expect(resolveModel({})).toBe(ANTHROPIC_HAIKU);
  });
});
