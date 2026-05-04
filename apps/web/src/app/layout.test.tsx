import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout from "./layout";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. Same workaround pattern as `dashboard-components.test.tsx`.
void React;

// We render a fragment (the layout assumes <html>/<body> are valid in HTML SSR), then assert
// the *first interactive* element on the page is the skip link pointing to #main-content.
// react-dom/server emits the children in tree order, and the skip link is the first child of
// <body>, so its anchor opener appears before any other focusable element in the markup.

describe("RootLayout — STORY-027 a11y baseline", () => {
  it("renders the skip-link as the first focusable element on the page", () => {
    const out = renderToStaticMarkup(
      <RootLayout>
        <main id="main-content">child</main>
      </RootLayout>,
    );

    // Skip link must exist and target #main-content.
    expect(out).toContain('href="#main-content"');
    expect(out).toContain("Skip to main content");

    // Tab order is determined by document order. Find the first focusable opener (a / button /
    // input) in the rendered string and assert it is the skip link.
    const firstAnchor = out.indexOf("<a ");
    const firstButton = out.indexOf("<button");
    const firstInput = out.indexOf("<input");
    const firstFocusable = Math.min(
      ...[firstAnchor, firstButton, firstInput].filter((i) => i >= 0),
    );
    expect(firstFocusable).toBe(firstAnchor);
    expect(firstAnchor).toBeGreaterThanOrEqual(0);

    // The first <a> must be the skip link (and therefore have the skip-link className).
    const firstAnchorTag = out.slice(firstAnchor, out.indexOf(">", firstAnchor) + 1);
    expect(firstAnchorTag).toContain('href="#main-content"');
    expect(firstAnchorTag).toContain("skip-link");
  });

  it("keeps the lang attribute on <html> for screen-reader pronunciation", () => {
    const out = renderToStaticMarkup(
      <RootLayout>
        <main id="main-content">child</main>
      </RootLayout>,
    );
    expect(out).toContain('lang="en"');
  });
});
