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

// STORY-044 — PWA baseline. The Next.js Metadata API adds the `<link rel="manifest">` and
// theme-color into the <head> at request time, so it doesn't appear in the static markup the
// other tests inspect. Instead we assert against the exported `metadata` object directly — that's
// the contract Next.js consumes.
import { metadata } from "./layout";

describe("RootLayout metadata — STORY-044 PWA baseline", () => {
  it("declares the web manifest path", () => {
    expect(metadata.manifest).toBe("/manifest.webmanifest");
  });

  it("declares the brand theme-color so installed-window chrome blends with the brand", () => {
    expect(metadata.themeColor).toBe("#0a7");
  });

  it("declares both 192 and 512 SVG icons (manifest-required sizes)", () => {
    const icon = metadata.icons;
    expect(icon).toBeDefined();
    if (typeof icon !== "object" || icon === null || Array.isArray(icon)) {
      throw new Error("metadata.icons must be an object");
    }
    const iconList = "icon" in icon && Array.isArray(icon.icon) ? icon.icon : [];
    // Each entry is an `IconDescriptor` (object with `url`/`sizes`/`type`) or a bare string/URL.
    // We only care about descriptor entries here — the bare-URL form has no size hint to assert.
    const sizes = iconList
      .map((i) =>
        typeof i === "object" && i !== null && "sizes" in i ? (i.sizes ?? undefined) : undefined,
      )
      .filter((s): s is string => typeof s === "string");
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });
});
