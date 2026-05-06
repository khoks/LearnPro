import { describe, expect, it } from "vitest";
import {
  CACHE_VERSION,
  decideStrategy,
  isApiRequest,
  isSameOrigin,
  isShellRoute,
  isStaticAsset,
  SHELL_PRECACHE_URLS,
  SHELL_ROUTES,
} from "./sw-handlers";

const O = "https://learnpro.test";

describe("sw-handlers — same-origin gating", () => {
  it("returns true for same-origin URLs", () => {
    expect(isSameOrigin(`${O}/dashboard`, O)).toBe(true);
  });
  it("returns false for cross-origin URLs", () => {
    expect(isSameOrigin("https://anthropic.com/api/messages", O)).toBe(false);
  });
  it("returns false for malformed URLs", () => {
    expect(isSameOrigin("not-a-url", O)).toBe(false);
  });
});

describe("sw-handlers — shell-route detection", () => {
  it.each(SHELL_ROUTES)("treats %s as a shell route", (path) => {
    expect(isShellRoute(path)).toBe(true);
  });
  it("rejects unrelated paths", () => {
    expect(isShellRoute("/auth/signin")).toBe(false);
    expect(isShellRoute("/session")).toBe(false);
    expect(isShellRoute("/playground")).toBe(false);
  });
});

describe("sw-handlers — static-asset detection", () => {
  it("matches /_next/static/** chunks", () => {
    expect(isStaticAsset("/_next/static/chunks/abc123.js")).toBe(true);
  });
  it("matches /icons/** SVGs", () => {
    expect(isStaticAsset("/icons/icon-192.svg")).toBe(true);
  });
  it("matches the manifest", () => {
    expect(isStaticAsset("/manifest.webmanifest")).toBe(true);
  });
  it("matches font / image extensions anywhere", () => {
    expect(isStaticAsset("/fonts/inter.woff2")).toBe(true);
    expect(isStaticAsset("/img/hero.png")).toBe(true);
    expect(isStaticAsset("/some/path/avatar.svg")).toBe(true);
  });
  it("never matches the SW file itself", () => {
    expect(isStaticAsset("/sw.js")).toBe(false);
  });
  it("rejects shell HTML routes", () => {
    expect(isStaticAsset("/dashboard")).toBe(false);
    expect(isStaticAsset("/")).toBe(false);
  });
});

describe("sw-handlers — API detection", () => {
  it("matches /api/** routes", () => {
    expect(isApiRequest("/api/autonomy/state")).toBe(true);
    expect(isApiRequest("/api/dashboard/install-eligible")).toBe(true);
  });
  it("rejects shell + static", () => {
    expect(isApiRequest("/dashboard")).toBe(false);
    expect(isApiRequest("/manifest.webmanifest")).toBe(false);
  });
});

describe("sw-handlers — decideStrategy", () => {
  it("never intercepts non-GET requests", () => {
    const out = decideStrategy({
      url: `${O}/dashboard`,
      origin: O,
      isNavigation: true,
      method: "POST",
    });
    expect(out).toBe("passthrough");
  });

  it("never intercepts cross-origin requests", () => {
    const out = decideStrategy({
      url: "https://api.anthropic.com/v1/messages",
      origin: O,
      isNavigation: false,
      method: "GET",
    });
    expect(out).toBe("passthrough");
  });

  it("routes /api/** to network-only (never cache)", () => {
    const out = decideStrategy({
      url: `${O}/api/dashboard/install-eligible`,
      origin: O,
      isNavigation: false,
      method: "GET",
    });
    expect(out).toBe("api-network-only");
  });

  it("routes shell-route navigations to cache-first", () => {
    const out = decideStrategy({
      url: `${O}/dashboard`,
      origin: O,
      isNavigation: true,
      method: "GET",
    });
    expect(out).toBe("shell-cache-first");
  });

  it("routes non-shell navigations to network-then-offline (so /session falls back to /offline)", () => {
    const out = decideStrategy({
      url: `${O}/session`,
      origin: O,
      isNavigation: true,
      method: "GET",
    });
    expect(out).toBe("navigation-network-then-offline");
  });

  it("routes static assets to stale-while-revalidate", () => {
    const out = decideStrategy({
      url: `${O}/_next/static/chunks/page-xyz.js`,
      origin: O,
      isNavigation: false,
      method: "GET",
    });
    expect(out).toBe("static-stale-while-revalidate");
  });

  it("falls through to passthrough for same-origin non-asset / non-shell GETs", () => {
    const out = decideStrategy({
      url: `${O}/some-random-non-asset-path`,
      origin: O,
      isNavigation: false,
      method: "GET",
    });
    expect(out).toBe("passthrough");
  });

  it("treats malformed URLs as passthrough (never caches them)", () => {
    const out = decideStrategy({
      url: "::::malformed::::",
      origin: O,
      isNavigation: true,
      method: "GET",
    });
    expect(out).toBe("passthrough");
  });
});

describe("sw-handlers — pre-cache list", () => {
  it("includes all shell routes plus the offline page", () => {
    for (const route of SHELL_ROUTES) {
      expect(SHELL_PRECACHE_URLS).toContain(route);
    }
  });
  it("includes the manifest + both manifest icons", () => {
    expect(SHELL_PRECACHE_URLS).toContain("/manifest.webmanifest");
    expect(SHELL_PRECACHE_URLS).toContain("/icons/icon-192.svg");
    expect(SHELL_PRECACHE_URLS).toContain("/icons/icon-512.svg");
  });
});

describe("sw-handlers — cache version", () => {
  it("uses the v1 namespace so old caches are evicted on bump", () => {
    expect(CACHE_VERSION).toBe("learnpro-shell-v1");
  });
});
