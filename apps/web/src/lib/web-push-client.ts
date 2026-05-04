// STORY-023 — browser-side helpers for the Web Push lifecycle.
//
// Pure functions + a small registration helper. No React, no state, no DOM beyond the Web Push
// + Service Worker APIs — keeps the unit test surface small (mock `navigator` / `window` and
// you have full coverage).

export type WebPushSupport =
  | { supported: true }
  | {
      supported: false;
      reason: "no_window" | "no_service_worker" | "no_push_manager" | "no_notification";
    };

export interface MinimalWindow {
  navigator: { serviceWorker?: unknown };
  PushManager?: unknown;
  Notification?: unknown;
}

export function detectSupport(
  win: MinimalWindow | undefined = typeof window === "undefined"
    ? undefined
    : (window as unknown as MinimalWindow),
): WebPushSupport {
  if (!win) return { supported: false, reason: "no_window" };
  if (!("serviceWorker" in win.navigator)) return { supported: false, reason: "no_service_worker" };
  if (!("PushManager" in win)) return { supported: false, reason: "no_push_manager" };
  if (!("Notification" in win)) return { supported: false, reason: "no_notification" };
  return { supported: true };
}

// Encode the VAPID public key from URL-safe base64 to Uint8Array (the format pushManager
// expects). Spec: https://www.rfc-editor.org/rfc/rfc8291.
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData =
    typeof globalThis.atob === "function"
      ? globalThis.atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface SubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// Convert a browser PushSubscription to the JSON shape the API expects.
export function serializeSubscription(sub: PushSubscription): SubscriptionPayload {
  const json = sub.toJSON();
  const keys = (json.keys ?? {}) as { p256dh?: string; auth?: string };
  if (!json.endpoint || !keys.p256dh || !keys.auth) {
    throw new Error("PushSubscription is missing endpoint or keys");
  }
  return {
    endpoint: json.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

export type EnableResult =
  | { ok: true; subscription: SubscriptionPayload }
  | {
      ok: false;
      reason: "denied" | "unsupported" | "no_vapid_key" | "subscribe_failed" | "register_failed";
    };

export interface EnableWebPushOptions {
  // GETs `/api/notifications/vapid-key`. Injectable so tests can mock.
  fetchVapidKey: () => Promise<string | null>;
  // POSTs the subscription body to `/api/notifications/subscribe`.
  postSubscription: (payload: SubscriptionPayload) => Promise<{ ok: boolean }>;
  serviceWorkerScope?: string;
  serviceWorkerPath?: string;
}

// Full flow:
//   1. detectSupport() — bail with `unsupported` if any browser API is missing.
//   2. Ask the user for permission. `default` → `denied` if they dismiss the prompt.
//   3. Register the SW (idempotent — re-registering returns the existing registration).
//   4. Fetch the VAPID public key + subscribe via pushManager.
//   5. POST the serialized subscription to the API.
export async function enableWebPush(opts: EnableWebPushOptions): Promise<EnableResult> {
  const support = detectSupport();
  if (!support.supported) return { ok: false, reason: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register(opts.serviceWorkerPath ?? "/sw.js", {
      scope: opts.serviceWorkerScope ?? "/",
    });
    // Wait for the SW to be ready before subscribing — registering does not guarantee active.
    await navigator.serviceWorker.ready;
  } catch {
    return { ok: false, reason: "register_failed" };
  }

  const vapidPublicKey = await opts.fetchVapidKey();
  if (!vapidPublicKey) return { ok: false, reason: "no_vapid_key" };

  let pushSubscription: PushSubscription;
  try {
    // The DOM `BufferSource` lib type wants ArrayBuffer (not ArrayBufferLike); copy the bytes
    // into a fresh ArrayBuffer-backed view so the lib.dom check is happy.
    const keyBytes = urlBase64ToUint8Array(vapidPublicKey);
    const ab = new ArrayBuffer(keyBytes.byteLength);
    new Uint8Array(ab).set(keyBytes);
    pushSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: ab,
    });
  } catch {
    return { ok: false, reason: "subscribe_failed" };
  }

  const payload = serializeSubscription(pushSubscription);
  const posted = await opts.postSubscription(payload);
  if (!posted.ok) return { ok: false, reason: "subscribe_failed" };
  return { ok: true, subscription: payload };
}
