import { describe, expect, it } from "vitest";
import {
  DISMISS_STORAGE_KEY,
  isDismissed,
  persistDismissal,
  shouldShowInstallPrompt,
  type InstallEligibilityResponse,
  type SimpleStorage,
} from "./install-prompt";

function makeStorage(
  initial?: Record<string, string>,
): SimpleStorage & { snapshot(): Record<string, string> } {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem(key) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
    snapshot() {
      return Object.fromEntries(map.entries());
    },
  };
}

const ELIGIBLE: InstallEligibilityResponse = {
  eligible: true,
  successful_episodes: 5,
  threshold: 3,
};
const NOT_ELIGIBLE: InstallEligibilityResponse = {
  eligible: false,
  successful_episodes: 1,
  threshold: 3,
};

describe("install-prompt — dismissal", () => {
  it("isDismissed returns false when storage has no key", () => {
    expect(isDismissed(makeStorage())).toBe(false);
  });

  it("isDismissed returns true when storage holds any non-empty value", () => {
    const store = makeStorage({ [DISMISS_STORAGE_KEY]: new Date().toISOString() });
    expect(isDismissed(store)).toBe(true);
  });

  it("isDismissed returns false when storage holds an empty string", () => {
    const store = makeStorage({ [DISMISS_STORAGE_KEY]: "" });
    expect(isDismissed(store)).toBe(false);
  });

  it("isDismissed returns false when storage is null (SSR / no-window)", () => {
    expect(isDismissed(null)).toBe(false);
  });

  it("persistDismissal writes an ISO timestamp under the key", () => {
    const store = makeStorage();
    const now = new Date("2026-04-30T12:00:00.000Z");
    persistDismissal(store, now);
    expect(store.snapshot()[DISMISS_STORAGE_KEY]).toBe("2026-04-30T12:00:00.000Z");
  });

  it("persistDismissal is a no-op when storage is null", () => {
    persistDismissal(null);
    // No throw, no global state. Nothing else to assert.
    expect(true).toBe(true);
  });

  it("isDismissed survives a getItem throw (private browsing)", () => {
    const store: SimpleStorage = {
      getItem() {
        throw new Error("private mode: storage disabled");
      },
      setItem() {},
    };
    expect(isDismissed(store)).toBe(false);
  });
});

describe("install-prompt — shouldShowInstallPrompt", () => {
  it("returns false when eligibility is unknown (still loading)", () => {
    expect(shouldShowInstallPrompt({ eligibility: null, dismissed: false })).toBe(false);
  });

  it("returns false when the user has dismissed", () => {
    expect(shouldShowInstallPrompt({ eligibility: ELIGIBLE, dismissed: true })).toBe(false);
  });

  it("returns false when the server says not eligible", () => {
    expect(shouldShowInstallPrompt({ eligibility: NOT_ELIGIBLE, dismissed: false })).toBe(false);
  });

  it("returns true only when eligible AND not dismissed", () => {
    expect(shouldShowInstallPrompt({ eligibility: ELIGIBLE, dismissed: false })).toBe(true);
  });

  it("dismissal beats eligibility (forever-dismiss is forever)", () => {
    expect(shouldShowInstallPrompt({ eligibility: ELIGIBLE, dismissed: true })).toBe(false);
  });
});

describe("install-prompt — round-trip", () => {
  it("persisting a dismissal flips isDismissed for the next read", () => {
    const store = makeStorage();
    expect(isDismissed(store)).toBe(false);
    persistDismissal(store, new Date("2026-04-30T12:00:00.000Z"));
    expect(isDismissed(store)).toBe(true);
  });
});
