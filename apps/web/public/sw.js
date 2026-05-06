// LearnPro service worker.
//
// Three logical sections:
//   1. install + activate + cache (STORY-044) — pre-caches the app shell, evicts stale cache
//      versions on bump, claims clients so the SW is live the moment registration completes.
//   2. push + notificationclick (STORY-023) — handles Web Push notifications + click routing.
//   3. fetch (STORY-044) — runtime cache strategy: cache-first for shell pages, stale-while-
//      revalidate for /_next/static assets, network-only for /api/**, network-then-offline
//      fallback for everything else.
//
// The decision logic in section 3 mirrors `apps/web/src/lib/sw-handlers.ts` line-for-line. SWs
// can't import from a bundled module — they're plain JS loaded by the browser at runtime — so we
// duplicate the constants here and rely on the (vitest-tested) helpers as the source of truth.
// Bump the cache version (CACHE_VERSION below) any time the strategy table or precache list
// changes; the activate handler will sweep the old cache.

// -----------------------------------------------------------------------------
// 1. install + activate + cache  (STORY-044)
// -----------------------------------------------------------------------------

const CACHE_VERSION = "learnpro-shell-v1";

const SHELL_PRECACHE_URLS = [
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

const SHELL_ROUTES = ["/", "/dashboard", "/onboarding", "/recommended", "/settings", "/offline"];

self.addEventListener("install", (event) => {
  // Activate immediately rather than waiting for old tabs to close. STORY-023's bell-icon flow
  // assumes the SW is live the moment the user clicks "Enable browser notifications"; STORY-044
  // wants the same so the offline shell is available on first reload after install.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Pre-cache opportunistically — `addAll` is atomic and would fail the whole install on
      // any single 404 (e.g. /onboarding redirecting through auth in dev). Adding URLs one-by-
      // one with caught failures lets the SW activate even if a redirect-protected route
      // didn't pre-cache; it'll be backfilled the first time the user visits it.
      return Promise.all(
        SHELL_PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { credentials: "same-origin" })).catch(() => undefined),
        ),
      );
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Evict any caches whose name doesn't match the current version. CACHE_VERSION bumps are
      // how we invalidate stale shell HTML on the next deploy.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// -----------------------------------------------------------------------------
// 2. push + notificationclick  (STORY-023)
// -----------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let payload = { title: "LearnPro", body: "", url: "/dashboard" };
  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.title === "string") payload.title = parsed.title;
        if (typeof parsed.body === "string") payload.body = parsed.body;
        if (typeof parsed.url === "string") payload.url = parsed.url;
      }
    } catch {
      // Non-JSON push (rare). Fall through to defaults.
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
      // No badge / icon assets in MVP — browser uses the favicon. Add later if needed.
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          if ("navigate" in client) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

// -----------------------------------------------------------------------------
// 3. fetch — runtime cache strategy  (STORY-044)
// -----------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only intercept GETs. Anything else (POST tutor calls, PUT settings, DELETE account) flows
  // straight to the network — we don't want to mutate state from cached payloads.
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Cross-origin requests pass through untouched (Anthropic API, Piston sandbox, analytics).
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isNavigation = req.mode === "navigate";

  // /api/** is per-user and time-sensitive; never cache.
  if (path.startsWith("/api/")) return;

  // Top-level navigations.
  if (isNavigation) {
    if (SHELL_ROUTES.includes(path)) {
      // Cache-first: return the cached shell HTML if we have it, otherwise hit the network and
      // backfill the cache. Falls back to /offline only when both legs fail.
      event.respondWith(shellCacheFirst(req));
    } else {
      // Non-shell navigations (/session, /playground, /auth/signin) are network-only with an
      // /offline fallback when the network is unreachable.
      event.respondWith(networkThenOffline(req));
    }
    return;
  }

  // Static assets (long-hash chunks, fonts, icons) → stale-while-revalidate.
  if (
    path.startsWith("/_next/static/") ||
    path.startsWith("/icons/") ||
    path === "/manifest.webmanifest" ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(path)
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Anything else (same-origin GET with no cache rule) — pass through.
});

async function shellCacheFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  if (cached) {
    // Refresh the cache in the background so the next visit gets the latest HTML.
    fetch(req)
      .then((res) => {
        if (res.ok) cache.put(req, res.clone());
      })
      .catch(() => undefined);
    return cached;
  }
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const offline = await cache.match("/offline");
    if (offline) return offline;
    throw new Error("offline and no cached shell");
  }
}

async function networkThenOffline(req) {
  try {
    return await fetch(req);
  } catch {
    const cache = await caches.open(CACHE_VERSION);
    const offline = await cache.match("/offline");
    if (offline) return offline;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  // Serve from cache immediately if present; otherwise wait for the network.
  return cached ?? (await networkPromise) ?? new Response("", { status: 504 });
}
