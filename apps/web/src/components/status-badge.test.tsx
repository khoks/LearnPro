import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBadge, type StatusBadgeVariant } from "./status-badge";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. Same workaround used in dashboard-components.test.tsx.
void React;

const VARIANT_ICONS: Record<StatusBadgeVariant, string> = {
  pass: "✓",
  fail: "✗",
  warn: "⚠",
  info: "ℹ",
};

describe("StatusBadge — STORY-027 (no-color-only signaling)", () => {
  for (const variant of Object.keys(VARIANT_ICONS) as StatusBadgeVariant[]) {
    it(`variant="${variant}" renders both icon AND text label`, () => {
      const out = renderToStaticMarkup(<StatusBadge variant={variant}>Hello</StatusBadge>);
      // Icon present.
      expect(out).toContain(VARIANT_ICONS[variant]);
      // Label present.
      expect(out).toContain("Hello");
      // Variant tagged in DOM for downstream styling / tests.
      expect(out).toContain(`data-status="${variant}"`);
    });

    it(`variant="${variant}" hides the icon glyph from assistive tech (no double-read)`, () => {
      const out = renderToStaticMarkup(<StatusBadge variant={variant}>Done</StatusBadge>);
      // Icon span carries aria-hidden so SRs only read "Done", not "checkmark Done".
      expect(out).toMatch(/aria-hidden="true">\W*[✓✗⚠ℹ]\W*</);
    });
  }

  it("renders the pass variant with WCAG-AA-friendly text+icon (not colour-only)", () => {
    const out = renderToStaticMarkup(<StatusBadge variant="pass">Passed</StatusBadge>);
    expect(out).toContain("✓");
    expect(out).toContain("Passed");
  });

  it("renders the fail variant with WCAG-AA-friendly text+icon (not colour-only)", () => {
    const out = renderToStaticMarkup(<StatusBadge variant="fail">Failed</StatusBadge>);
    expect(out).toContain("✗");
    expect(out).toContain("Failed");
  });
});
