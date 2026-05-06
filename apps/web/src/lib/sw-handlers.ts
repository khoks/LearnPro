// STORY-044 — Pure decision helpers for the offline cache layer of `apps/web/public/sw.js`.
//
// Service workers can't be loaded into vitest's jsdom environment (no real ServiceWorker scope,
// no CacheStorage), so we extract the routing decisions into pure functions that take strings
// and return enums. The SW file then translates those enums into Cache + fetch operations.
// Same pattern packages/scoring uses for adaptive policies — keep the side-effecting wrapper thin
// and the decision logic 100% testable.

export const SHELL_ROUTES = [
  "/",
  "/dashboard",
  "/onboarding",
  "/recommended",
  "/settings",
  "/offline",
] as const;
export type ShellRoute = (typeof SHELL_ROUTES)[number];

export type FetchStrategy =
  | "shell-cache-first"
  | "static-stale-while-revalidate"
  | "api-network-only"
  | "navigation-network-then-offline"
  | "passthrough";

// Same-origin-vs-cross-origin gates the helpers below. Cross-origin requests always pass
// through — we don't proxy third-party CDNs / analytics / Anthropic.
export function isSameOrigin(requestUrl: string, origin: string): boolean {
  try {
    return new URL(requestUrl).origin === origin;
  } catch {
    return false;
  }
}

// True if the path matches one of the pre-cached shell routes (exact match — query strings and
// fragments don't change which page chunk renders).
export function isShellRoute(pathname: string): boolean {
  return (SHELL_ROUTES as readonly string[]).includes(pathname);
}

// True for assets webpack emits under /_next/static/** (long-hash-named chunks, fonts, etc.) and
// for top-level static files we want cached for offline reload (favicons, icons, manifest).
export function isStaticAsset(pathname: string): boolean {
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname.startsWith("/icons/")) return true;
  if (pathname === "/manifest.webmanifest") return true;
  if (pathname === "/sw.js") return false; // never cache the SW itself
  // Common static media + font extensions
  return /\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(pathname);
}

// True for API calls (Next.js route handlers + Fastify proxies). Never serve these from cache —
// they're per-user and time-sensitive.
export function isApiRequest(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

// Service workers expose `request.mode === "navigate"` for top-level page loads. We use that to
// decide between the page-shell strategy (cache-first for the listed routes, falling back to
// /offline) and the static-asset strategy. Encoded as a wrapper so tests don't need a Request.
export interface RouteDecisionInput {
  url: string;
  origin: string;
  // True when the browser tells us this fetch is a top-level navigation (HTML page load).
  isNavigation: boolean;
  method: string;
}

export function decideStrategy(input: RouteDecisionInput): FetchStrategy {
  // Only intercept GETs. Anything else (POST tutor calls, PUT settings, DELETE account) flows
  // straight to the network — we don't want to mutate state from cached payloads.
  if (input.method !== "GET") return "passthrough";

  if (!isSameOrigin(input.url, input.origin)) return "passthrough";

  let pathname: string;
  try {
    pathname = new URL(input.url).pathname;
  } catch {
    return "passthrough";
  }

  if (isApiRequest(pathname)) return "api-network-only";

  if (input.isNavigation) {
    if (isShellRoute(pathname)) return "shell-cache-first";
    return "navigation-network-then-offline";
  }

  if (isStaticAsset(pathname)) return "static-stale-while-revalidate";

  return "passthrough";
}

// Shell URLs to pre-cache during the SW `install` event. Same list as `SHELL_ROUTES` minus
// `/offline` (which is served from cache when no other route matches). Plus the manifest +
// icons + a fingerprint-stable favicon so the installed app looks right offline.
export const SHELL_PRECACHE_URLS: readonly string[] = [
  "/",
  "/dashboard",
  "/onboarding",
  "/recommended",
  "/settings",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

// Cache name. Bump the suffix on any change to either the SHELL_PRECACHE_URLS list or the
// strategy table — the activate handler deletes any caches whose name doesn't match the current
// version, which is how we invalidate stale shell HTML on the next deploy.
export const CACHE_VERSION = "learnpro-shell-v1";
