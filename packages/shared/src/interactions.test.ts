import { describe, expect, it } from "vitest";
import {
  InteractionEventSchema,
  InteractionsBatchSchema,
  InteractionTypeSchema,
  MAX_INTERACTIONS_PER_BATCH,
} from "./interactions.js";

describe("InteractionTypeSchema", () => {
  it("covers all 9 event kinds defined in STORY-055", () => {
    expect(InteractionTypeSchema.options).toEqual([
      "cursor_focus",
      "voice",
      "edit",
      "revert",
      "run",
      "submit",
      "hint_request",
      "hint_received",
      "autonomy_decision",
    ]);
  });
});

describe("InteractionEventSchema", () => {
  it("accepts a cursor_focus event", () => {
    const parsed = InteractionEventSchema.parse({
      type: "cursor_focus",
      payload: { line_start: 4, line_end: 7, duration_ms: 1200 },
    });
    expect(parsed.type).toBe("cursor_focus");
  });

  it("accepts an edit event with a range", () => {
    const parsed = InteractionEventSchema.parse({
      type: "edit",
      payload: {
        from: "x = 1",
        to: "x = 2",
        range: { start_line: 1, start_col: 0, end_line: 1, end_col: 5 },
      },
    });
    expect(parsed.type).toBe("edit");
  });

  it("accepts hint_request with rung 1 / 2 / 3", () => {
    for (const rung of [1, 2, 3] as const) {
      const parsed = InteractionEventSchema.parse({ type: "hint_request", payload: { rung } });
      if (parsed.type !== "hint_request") throw new Error("expected hint_request");
      expect(parsed.payload.rung).toBe(rung);
    }
  });

  it("rejects hint_request with rung 4 (out of band)", () => {
    const parsed = InteractionEventSchema.safeParse({
      type: "hint_request",
      payload: { rung: 4 },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown type (discriminated-union guards), even with a valid-looking payload", () => {
    const parsed = InteractionEventSchema.safeParse({
      type: "keystroke",
      payload: { keys: "abc" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a payload from a different type (cross-type smuggle)", () => {
    const parsed = InteractionEventSchema.safeParse({
      type: "cursor_focus",
      payload: { passed: true },
    });
    expect(parsed.success).toBe(false);
  });

  it("autonomy_decision requires confidence in [0, 1]", () => {
    expect(
      InteractionEventSchema.safeParse({
        type: "autonomy_decision",
        payload: { decision: "ask", confidence: 1.4 },
      }).success,
    ).toBe(false);
    expect(
      InteractionEventSchema.parse({
        type: "autonomy_decision",
        payload: { decision: "ask", confidence: 0.6 },
      }).type,
    ).toBe("autonomy_decision");
  });

  it("optional t must be a valid ISO datetime when supplied", () => {
    expect(
      InteractionEventSchema.safeParse({
        type: "submit",
        payload: { passed: true },
        t: "yesterday",
      }).success,
    ).toBe(false);
    expect(
      InteractionEventSchema.parse({
        type: "submit",
        payload: { passed: true },
        t: "2026-04-26T12:00:00.000Z",
      }).t,
    ).toBe("2026-04-26T12:00:00.000Z");
  });
});

describe("InteractionsBatchSchema", () => {
  it("accepts a non-empty batch of mixed events", () => {
    const parsed = InteractionsBatchSchema.parse({
      events: [
        {
          type: "cursor_focus",
          payload: { line_start: 1, line_end: 2, duration_ms: 250 },
        },
        { type: "submit", payload: { passed: true } },
      ],
    });
    expect(parsed.events).toHaveLength(2);
  });

  it("rejects an empty batch (don't pay a round-trip for nothing)", () => {
    expect(InteractionsBatchSchema.safeParse({ events: [] }).success).toBe(false);
  });

  it(`enforces MAX_INTERACTIONS_PER_BATCH (${MAX_INTERACTIONS_PER_BATCH}) so a runaway client can't OOM the server`, () => {
    const oversize = {
      events: Array.from({ length: MAX_INTERACTIONS_PER_BATCH + 1 }, () => ({
        type: "submit" as const,
        payload: { passed: true },
      })),
    };
    expect(InteractionsBatchSchema.safeParse(oversize).success).toBe(false);
  });
});
