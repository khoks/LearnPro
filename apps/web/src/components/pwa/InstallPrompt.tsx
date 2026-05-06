"use client";

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  isDismissed,
  persistDismissal,
  shouldShowInstallPrompt,
  type InstallEligibilityResponse,
  type SimpleStorage,
} from "../../lib/install-prompt";

void React;

// STORY-044 — "Install LearnPro" prompt that lives at the top of the dashboard. Only renders
// when:
//   1. The browser fired `beforeinstallprompt` (i.e. the PWA criteria are met and the user is on
//      a Chromium-family browser that supports A2HS prompts).
//   2. The eligibility endpoint says the user has ≥3 successful sessions.
//   3. The user hasn't tapped "Don't ask again".
//
// Coach-voice copy. Forbidden phrases (validated by test): no FOMO, no streak shaming, no
// all-caps imperatives. The prompt is skippable forever via the small dismissal link.

// Minimal subset of the BeforeInstallPromptEvent — typed precisely so we can unit-test the
// component without bringing in the full `dom` types that depend on browser globals.
interface BeforeInstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface InstallPromptProps {
  // Test-only injection points. Production reads localStorage + window directly.
  storageOverride?: SimpleStorage;
  fetcher?: typeof fetch;
  installEventOverride?: BeforeInstallPromptEventLike;
  initialEligibility?: InstallEligibilityResponse;
  loadOnMount?: boolean;
}

export function InstallPrompt(props: InstallPromptProps = {}): React.ReactElement | null {
  const fetcher = props.fetcher ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const storage =
    props.storageOverride ??
    (typeof window !== "undefined" && typeof window.localStorage !== "undefined"
      ? window.localStorage
      : null);

  const [eligibility, setEligibility] = useState<InstallEligibilityResponse | null>(
    props.initialEligibility ?? null,
  );
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEventLike | null>(
    props.installEventOverride ?? null,
  );
  const [dismissed, setDismissed] = useState<boolean>(false);

  // Read dismissal state on mount (storage doesn't exist during SSR).
  useEffect(() => {
    setDismissed(isDismissed(storage));
  }, [storage]);

  // Listen for the browser's beforeinstallprompt event so we can stash it and trigger A2HS later.
  useEffect(() => {
    if (props.installEventOverride) return;
    if (typeof window === "undefined") return;
    const onBeforeInstallPrompt = (e: Event): void => {
      e.preventDefault();
      // The event object is what we'll later call `.prompt()` on.
      setInstallEvent(e as BeforeInstallPromptEventLike);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, [props.installEventOverride]);

  // Pull eligibility from the API.
  const refresh = useCallback(async () => {
    if (!fetcher) return;
    try {
      const res = await fetcher("/api/dashboard/install-eligible");
      if (!res.ok) return;
      const body = (await res.json()) as InstallEligibilityResponse;
      setEligibility(body);
    } catch {
      // soft-fail: the prompt simply doesn't show
    }
  }, [fetcher]);

  useEffect(() => {
    if (props.loadOnMount === false) return;
    void refresh();
  }, [refresh, props.loadOnMount]);

  const onInstall = useCallback(async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      // Whichever outcome — we never ask again. The browser remembers if the install succeeded;
      // if the user dismissed in the system dialog, that counts as "no thanks for now" and we
      // honour it like a manual dismissal.
      persistDismissal(storage);
      setDismissed(true);
      // Drop the saved event — `prompt()` can only be called once per event.
      setInstallEvent(null);
      void choice;
    } catch {
      // soft-fail: leave the prompt visible so the user can retry
    }
  }, [installEvent, storage]);

  const onDismiss = useCallback(() => {
    persistDismissal(storage);
    setDismissed(true);
  }, [storage]);

  const visible = shouldShowInstallPrompt({ eligibility, dismissed }) && installEvent !== null;
  if (!visible) return null;

  return (
    <section
      data-testid="install-prompt"
      role="region"
      aria-label="Install LearnPro"
      style={{
        border: "1px solid #0a7",
        borderRadius: 8,
        padding: "1rem 1.1rem",
        background: "#f3fbf7",
        marginBottom: "1rem",
        display: "grid",
        gap: "0.6rem",
      }}
    >
      <div>
        <strong style={{ fontSize: "1rem" }}>Install LearnPro</strong>
        <p style={{ margin: "0.35rem 0 0", color: "#444", fontSize: "0.95rem", lineHeight: 1.45 }}>
          Add LearnPro to your dock or home screen for one-tap access. Works offline for the
          dashboard and your past work; the editor still needs internet to run code.
        </p>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onInstall}
          data-testid="install-prompt-install"
          style={{
            padding: "0.5rem 1rem",
            background: "#0a7",
            color: "white",
            border: "none",
            borderRadius: 4,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Install LearnPro
        </button>
        <button
          type="button"
          onClick={onDismiss}
          data-testid="install-prompt-dismiss"
          style={{
            padding: "0.4rem 0.6rem",
            background: "transparent",
            color: "#555",
            border: "none",
            cursor: "pointer",
            fontSize: "0.9rem",
            textDecoration: "underline",
          }}
        >
          Don&apos;t ask again
        </button>
      </div>
    </section>
  );
}
