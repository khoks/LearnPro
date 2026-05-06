import * as React from "react";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. Same workaround pattern as elsewhere in apps/web.
void React;

// STORY-044 — `/offline` is the fallback page the service worker serves when the user navigates
// somewhere new while offline (and we don't have a cached copy). Coach-voice copy: explain what's
// happening, list what still works, never blame the user.
//
// Server component — no client state. The list of cached pages is hardcoded to the SHELL_ROUTES
// in `apps/web/src/lib/sw-handlers.ts`; if that list changes, update this file too.

const CACHED_PAGES: { href: string; label: string; description: string }[] = [
  { href: "/dashboard", label: "Dashboard", description: "XP, streak, your tracks." },
  { href: "/recommended", label: "Recommended tracks", description: "Where to begin." },
  {
    href: "/onboarding",
    label: "Onboarding",
    description: "Pick up where you left off.",
  },
  { href: "/settings/data", label: "Settings", description: "Quiet hours, your data." },
];

export const metadata = {
  title: "Offline · LearnPro",
};

export default function OfflinePage() {
  return (
    <main
      id="main-content"
      data-testid="offline-page"
      style={{
        padding: "1.5rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>You&apos;re offline</h1>
      <p style={{ color: "#444", marginBottom: "1rem", lineHeight: 1.5 }}>
        Reconnect to continue practicing. The editor needs an internet connection to run code, but a
        few pages are still available from your last visit.
      </p>
      <section aria-label="Pages you can still visit" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Still available</h2>
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem" }}>
          {CACHED_PAGES.map((p) => (
            <li
              key={p.href}
              style={{
                padding: "0.75rem 1rem",
                border: "1px solid #ddd",
                borderRadius: 6,
                background: "white",
              }}
            >
              <a href={p.href} style={{ fontWeight: 600, color: "#0a7", textDecoration: "none" }}>
                {p.label}
              </a>
              <p style={{ margin: "0.25rem 0 0", color: "#666", fontSize: "0.9rem" }}>
                {p.description}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
