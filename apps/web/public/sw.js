// STORY-023 — minimal service worker for the bell-icon + Web Push flow.
//
// Two responsibilities:
//   1. `push` event → display a system notification with the JSON payload the API serializes.
//   2. `notificationclick` event → focus an existing LearnPro tab if one is open, else open
//      the URL the payload points at (defaults to /dashboard).
//
// Anything more (caching, offline shell, install/activate ceremonies) is out of scope here —
// that's STORY-044 (PWA baseline). Keeping the file small + purpose-specific keeps the
// "browser updates the SW" cycle fast.

self.addEventListener("install", () => {
  // Activate immediately rather than waiting for old tabs to close. The bell-icon flow assumes
  // the SW is live the moment the user clicks "Enable browser notifications".
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
