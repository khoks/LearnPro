import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  VariantFailuresTable,
  formatDetail,
  formatReason,
  formatTimestamp,
  type VariantFailureRow,
} from "./VariantFailuresTable";

void React;

// STORY-039e — Presentational tests for the admin variant-failures table. Pure
// server-side rendering, no client state. The auth + redirect path lives in page.tsx;
// here we only assert the rendering surface.

function sampleRow(overrides: Partial<VariantFailureRow> = {}): VariantFailureRow {
  return {
    id: "f-1",
    source_problem_id: "44444444-4444-4444-8444-444444444444",
    source_problem_slug: "sum-even-numbers",
    attempted_at: "2026-05-10T10:00:00.000Z",
    failure_reason: "parse_error",
    failure_detail: { reason: "invalid_json", error: "unexpected token" },
    model_id: "claude-haiku-4",
    attempt_number: 1,
    ...overrides,
  };
}

describe("VariantFailuresTable — STORY-039e", () => {
  it("renders the heading + summary line with the total count", () => {
    const out = renderToStaticMarkup(<VariantFailuresTable failures={[]} total={42} />);
    expect(out).toContain("Variant gate failures");
    expect(out).toContain("42 total");
  });

  it("renders one row per failure with the source problem slug", () => {
    const rows = [
      sampleRow({ id: "f-1", source_problem_slug: "sum-even-numbers" }),
      sampleRow({ id: "f-2", source_problem_slug: "max-of-list" }),
    ];
    const out = renderToStaticMarkup(<VariantFailuresTable failures={rows} total={2} />);
    expect(out).toContain("sum-even-numbers");
    expect(out).toContain("max-of-list");
  });

  it("falls back to the source_problem_id when slug is null", () => {
    const row = sampleRow({ source_problem_slug: null, source_problem_id: "abc-uuid" });
    const out = renderToStaticMarkup(<VariantFailuresTable failures={[row]} total={1} />);
    expect(out).toContain("abc-uuid");
  });

  it("formats well-known failure reasons into operator-friendly labels", () => {
    const rows = [
      sampleRow({ id: "f-1", failure_reason: "parse_error" }),
      sampleRow({ id: "f-2", failure_reason: "identity_mismatch" }),
      sampleRow({ id: "f-3", failure_reason: "self_validation" }),
      sampleRow({ id: "f-4", failure_reason: "retry_exhausted" }),
      sampleRow({ id: "f-5", failure_reason: "spec_clarity_judge" }),
    ];
    const out = renderToStaticMarkup(<VariantFailuresTable failures={rows} total={5} />);
    expect(out).toContain("Parse error");
    expect(out).toContain("Identity drift");
    expect(out).toContain("Self-validation");
    expect(out).toContain("Retry exhausted");
    expect(out).toContain("Spec clarity");
  });

  it("renders the failure_detail JSON inside a <pre> block", () => {
    const row = sampleRow({
      failure_detail: { field: "language", expected: "python", got: "typescript" },
    });
    const out = renderToStaticMarkup(<VariantFailuresTable failures={[row]} total={1} />);
    expect(out).toContain("<pre");
    expect(out).toContain("language");
    expect(out).toContain("typescript");
  });

  it("renders the model_id + attempt_number columns", () => {
    const row = sampleRow({ model_id: "claude-haiku-4", attempt_number: 2 });
    const out = renderToStaticMarkup(<VariantFailuresTable failures={[row]} total={1} />);
    expect(out).toContain("claude-haiku-4");
    expect(out).toContain(">2<");
  });

  it("shows an empty-state message when there are no failures", () => {
    const out = renderToStaticMarkup(<VariantFailuresTable failures={[]} total={0} />);
    expect(out).toContain("No variant gate failures recorded yet");
    expect(out).not.toContain("<table");
  });

  it("never includes destructive action buttons (read-only surface)", () => {
    const rows = [sampleRow()];
    const out = renderToStaticMarkup(<VariantFailuresTable failures={rows} total={1} />);
    expect(out).not.toContain("Delete");
    expect(out).not.toContain("Retry");
    expect(out).not.toContain("Publish");
    expect(out).not.toContain("<button");
  });
});

describe("formatReason — STORY-039e", () => {
  it("maps each known reason to its human label", () => {
    expect(formatReason("parse_error")).toBe("Parse error");
    expect(formatReason("identity_mismatch")).toBe("Identity drift");
    expect(formatReason("self_validation")).toBe("Self-validation");
    expect(formatReason("retry_exhausted")).toBe("Retry exhausted");
    expect(formatReason("spec_clarity_judge")).toBe("Spec clarity");
  });

  it("returns the raw reason for unknown discriminators (defensive fallback)", () => {
    expect(formatReason("unknown_reason")).toBe("unknown_reason");
  });
});

describe("formatDetail — STORY-039e", () => {
  it("pretty-prints a small JSON object", () => {
    expect(formatDetail({ a: 1, b: "two" })).toContain('"a": 1');
  });

  it("survives circular-shaped input via the catch fallback", () => {
    const obj: Record<string, unknown> = {};
    obj["self"] = obj;
    const out = formatDetail(obj);
    expect(typeof out).toBe("string");
  });
});

describe("formatTimestamp — STORY-039e", () => {
  it("returns ISO format for a valid date string", () => {
    expect(formatTimestamp("2026-05-10T10:00:00.000Z")).toBe("2026-05-10T10:00:00.000Z");
  });

  it("falls back to the raw input for an invalid date", () => {
    expect(formatTimestamp("not a date")).toBe("not a date");
  });
});
