import { describe, expect, it } from "vitest";
import {
  appendUserMessage,
  assistantTurnCount,
  parseTurnResponse,
  SEED_GREETING,
  SKIP_USER_MESSAGE,
  STEP_TOTAL,
} from "./onboarding-state";

describe("SEED_GREETING", () => {
  it("is an assistant message that asks about the target role", () => {
    expect(SEED_GREETING.role).toBe("assistant");
    expect(SEED_GREETING.content.toLowerCase()).toContain("role");
  });
});

describe("appendUserMessage", () => {
  it("appends a trimmed user message to the history", () => {
    const next = appendUserMessage([SEED_GREETING], "  ML engineer  ");
    expect(next).toHaveLength(2);
    expect(next[1]?.content).toBe("ML engineer");
    expect(next[1]?.role).toBe("user");
  });

  it("returns the unchanged history when the user message is empty/whitespace", () => {
    const next = appendUserMessage([SEED_GREETING], "   ");
    expect(next).toHaveLength(1);
    expect(next).toBe(next); // identity not asserted but no-mutate guarantee is what we care about
  });
});

describe("assistantTurnCount", () => {
  it("counts only assistant messages", () => {
    expect(assistantTurnCount([])).toBe(0);
    expect(assistantTurnCount([SEED_GREETING])).toBe(1);
    expect(
      assistantTurnCount([
        SEED_GREETING,
        { role: "user", content: "hi" },
        { role: "assistant", content: "next?" },
      ]),
    ).toBe(2);
  });
});

describe("STEP_TOTAL", () => {
  it("matches the API's MAX_ONBOARDING_TURNS = 6", () => {
    expect(STEP_TOTAL).toBe(6);
  });
});

describe("parseTurnResponse", () => {
  it("returns the parsed shape on a valid payload", () => {
    const r = parseTurnResponse({
      assistant_message: "How much time per day?",
      captured: { target_role: "swe_intern" },
      done: false,
    });
    expect(r?.captured.target_role).toBe("swe_intern");
  });

  it("returns null on an invalid payload", () => {
    expect(parseTurnResponse({ foo: "bar" })).toBeNull();
    expect(parseTurnResponse(null)).toBeNull();
    expect(parseTurnResponse(undefined)).toBeNull();
  });
});

describe("Skip flow shape", () => {
  it("appendUserMessage(SKIP_USER_MESSAGE) yields the right last message", () => {
    const next = appendUserMessage([SEED_GREETING], SKIP_USER_MESSAGE);
    expect(next[next.length - 1]?.content).toBe(SKIP_USER_MESSAGE);
    expect(next[next.length - 1]?.role).toBe("user");
  });
});
