"use client";

import * as React from "react";
import { useEffect, useState } from "react";

void React;

// STORY-044 — top-of-page banner for `/session` and `/playground`. Tells the user the editor
// can't run code without internet, but their existing progress (hint history, dashboard, etc.)
// is still accessible via the cached shell.
//
// Coach-voice copy. Forbidden phrases (validated by test): "DON'T LOSE", "lose your streak",
// "fall behind", "miss reminders", "DAY ", fire / warning emoji.
//
// Two ways to drive the banner:
//   1. The default — listen to the browser's `online` / `offline` events and `navigator.onLine`.
//   2. Test-only — pass `forceOffline={true}` to render the banner in SSR / unit tests where
//      `navigator` isn't reliable.

export interface OfflineBannerProps {
  // Test-only override. Production callers leave this undefined.
  forceOffline?: boolean;
}

export function OfflineBanner(props: OfflineBannerProps = {}): React.ReactElement | null {
  const [browserOffline, setBrowserOffline] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    // Initialize from `navigator.onLine` first paint after hydration. Some browsers report
    // `false` even when online (cellular), so the banner is best-effort: false negatives
    // (banner doesn't show but should) are far less harmful than false positives (banner
    // shows when the editor actually does work — confusing). Trust `navigator.onLine` here.
    setBrowserOffline(!navigator.onLine);
    const onOnline = (): void => setBrowserOffline(false);
    const onOffline = (): void => setBrowserOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const offline = props.forceOffline ?? browserOffline;
  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      style={{
        background: "#fff8e1",
        border: "1px solid #f4c25f",
        borderRadius: 6,
        padding: "0.75rem 1rem",
        marginBottom: "1rem",
        color: "#5b4500",
        fontSize: "0.92rem",
        lineHeight: 1.45,
      }}
    >
      <strong style={{ display: "block", marginBottom: "0.25rem" }}>You&apos;re offline</strong>
      <span>
        The editor needs an internet connection to run code. Hints, history, and your dashboard
        still work.
      </span>
    </div>
  );
}
