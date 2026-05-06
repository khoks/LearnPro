// STORY-044 — pure helpers for the PWA install-prompt eligibility + dismissal flow. Lifted out
// of the React component so the rules are unit-testable without jsdom + a real localStorage.

export const DISMISS_STORAGE_KEY = "learnpro:install-prompt-dismissed-at";

export interface InstallEligibilityResponse {
  eligible: boolean;
  successful_episodes: number;
  threshold: number;
}

// Minimal localStorage shape so tests can pass in a `Map`-backed fake without dragging in jsdom.
export interface SimpleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// True when the user has previously clicked "Don't ask again". The stored value is an ISO
// timestamp string; presence of any non-empty value counts as a forever dismissal.
export function isDismissed(storage: SimpleStorage | null | undefined): boolean {
  if (!storage) return false;
  try {
    const v = storage.getItem(DISMISS_STORAGE_KEY);
    return typeof v === "string" && v.length > 0;
  } catch {
    // If localStorage throws (private browsing, quota), treat as not-dismissed and let the user
    // see the prompt at most once per session.
    return false;
  }
}

// Persist a dismissal. ISO timestamp gives us a future audit handle if we ever want to show the
// prompt again after N days; for now the value is informational.
export function persistDismissal(
  storage: SimpleStorage | null | undefined,
  now: Date = new Date(),
): void {
  if (!storage) return;
  try {
    storage.setItem(DISMISS_STORAGE_KEY, now.toISOString());
  } catch {
    // Quota / private-browsing — silently ignore. Worst case the user sees the prompt again.
  }
}

// Combined visibility rule: show only when (a) the server says the user is eligible AND (b) the
// user hasn't dismissed it. Pure, takes both signals as inputs.
export function shouldShowInstallPrompt(input: {
  eligibility: InstallEligibilityResponse | null;
  dismissed: boolean;
}): boolean {
  if (!input.eligibility) return false;
  if (input.dismissed) return false;
  return input.eligibility.eligible;
}
