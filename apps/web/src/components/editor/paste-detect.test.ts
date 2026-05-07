import { describe, expect, it } from "vitest";
import { buildPasteContext, shouldTriggerPasteModal } from "./paste-detect";

describe("shouldTriggerPasteModal", () => {
  it("does not trigger on empty paste", () => {
    expect(shouldTriggerPasteModal({ text: "", current_content: "abc" })).toBe(false);
  });

  it("triggers when pasted text is longer than 20 chars (length rule)", () => {
    const long = "x".repeat(21);
    expect(shouldTriggerPasteModal({ text: long, current_content: long })).toBe(true);
  });

  it("does not trigger when pasted text is exactly 20 chars and ratio is below threshold", () => {
    const twenty = "x".repeat(20);
    // 20 / 100 = 0.2 < 0.3, so neither rule fires (length is strict >)
    expect(shouldTriggerPasteModal({ text: twenty, current_content: "x".repeat(100) })).toBe(false);
  });

  it("triggers when pasted text exceeds 30% of editor content even if short", () => {
    // 5 chars pasted into 10 chars existing = 0.5 ratio > 0.3
    expect(shouldTriggerPasteModal({ text: "12345", current_content: "abcdefghij" })).toBe(true);
  });

  it("does not trigger when pasted text is below both thresholds", () => {
    // 5 chars pasted into 100 chars existing = 0.05 ratio, length=5, neither rule fires
    expect(shouldTriggerPasteModal({ text: "12345", current_content: "x".repeat(100) })).toBe(
      false,
    );
  });

  it("does not trigger when pasted text is short into an empty editor (no false positive)", () => {
    // 5-char paste into empty editor: length < 21 and current_content === 0 → no trigger
    expect(shouldTriggerPasteModal({ text: "12345", current_content: "" })).toBe(false);
  });

  it("triggers a long paste into an empty editor (length rule)", () => {
    expect(shouldTriggerPasteModal({ text: "x".repeat(50), current_content: "" })).toBe(true);
  });
});

describe("buildPasteContext", () => {
  it("clamps the preview to 200 chars and trims trailing whitespace", () => {
    const text = "a".repeat(199) + "  \n";
    const ctx = buildPasteContext({ text, current_content: "" });
    expect(ctx.preview.length).toBeLessThanOrEqual(200);
    expect(ctx.preview.endsWith(" ")).toBe(false);
    expect(ctx.preview.endsWith("\n")).toBe(false);
  });

  it("computes the ratio correctly when the editor has content", () => {
    const ctx = buildPasteContext({ text: "abc", current_content: "abcdef" });
    expect(ctx.paste_ratio).toBeCloseTo(0.5, 6);
    expect(ctx.paste_length).toBe(3);
  });

  it("returns 0 ratio when the editor is empty (no divide-by-zero)", () => {
    const ctx = buildPasteContext({ text: "abc", current_content: "" });
    expect(ctx.paste_ratio).toBe(0);
  });
});
