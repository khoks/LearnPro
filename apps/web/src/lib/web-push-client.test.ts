import { describe, expect, it, vi } from "vitest";
import {
  detectSupport,
  enableWebPush,
  serializeSubscription,
  urlBase64ToUint8Array,
  type SubscriptionPayload,
} from "./web-push-client.js";

describe("detectSupport", () => {
  it("returns no_window when window is missing (SSR)", () => {
    const result = detectSupport(undefined);
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toBe("no_window");
  });

  it("returns no_service_worker when navigator.serviceWorker is missing", () => {
    const fakeWin = {
      navigator: {},
      PushManager: function () {},
      Notification: function () {},
    } as unknown as Window;
    const result = detectSupport(
      fakeWin as unknown as import("./web-push-client.js").MinimalWindow,
    );
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toBe("no_service_worker");
  });

  it("returns no_push_manager when PushManager is missing", () => {
    const fakeWin = {
      navigator: { serviceWorker: {} },
      Notification: function () {},
    } as unknown as Window;
    const result = detectSupport(
      fakeWin as unknown as import("./web-push-client.js").MinimalWindow,
    );
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toBe("no_push_manager");
  });

  it("returns no_notification when Notification is missing", () => {
    const fakeWin = {
      navigator: { serviceWorker: {} },
      PushManager: function () {},
    } as unknown as import("./web-push-client.js").MinimalWindow;
    const result = detectSupport(
      fakeWin as unknown as import("./web-push-client.js").MinimalWindow,
    );
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toBe("no_notification");
  });

  it("returns supported=true when all three APIs exist", () => {
    const fakeWin = {
      navigator: { serviceWorker: {} },
      PushManager: function () {},
      Notification: function () {},
    } as unknown as import("./web-push-client.js").MinimalWindow;
    const result = detectSupport(
      fakeWin as unknown as import("./web-push-client.js").MinimalWindow,
    );
    expect(result.supported).toBe(true);
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes a URL-safe base64 string with padding", () => {
    const out = urlBase64ToUint8Array("AQID"); // [1, 2, 3]
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it("handles strings missing padding", () => {
    const out = urlBase64ToUint8Array("AQ"); // [1] but with no padding
    expect(Array.from(out)).toEqual([1]);
  });

  it("converts URL-safe characters - and _", () => {
    const out = urlBase64ToUint8Array("-_8");
    expect(out.length).toBe(2);
  });
});

describe("serializeSubscription", () => {
  it("flattens a PushSubscription into the API shape", () => {
    const sub = {
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "p256", auth: "auth" },
      }),
    } as unknown as PushSubscription;
    const out = serializeSubscription(sub);
    expect(out).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "p256", auth: "auth" },
    });
  });

  it("throws when toJSON is missing endpoint or keys", () => {
    const sub = {
      toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
    } as unknown as PushSubscription;
    expect(() => serializeSubscription(sub)).toThrow();
  });
});

describe("enableWebPush", () => {
  it("returns reason='unsupported' when there's no window (SSR path)", async () => {
    const out = await enableWebPush({
      fetchVapidKey: async () => "x",
      postSubscription: async () => ({ ok: true }),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("unsupported");
  });

  // Stub out the window-shaped APIs so the rest of the flow can be exercised. Vitest doesn't
  // give us a real browser; we spy on the registration + permission ceremonies.
  it("returns reason='denied' when Notification.requestPermission returns 'default'", async () => {
    const requestPermission = vi.fn().mockResolvedValue("default");
    const fakeWin = {
      navigator: { serviceWorker: { register: vi.fn(), ready: Promise.resolve() } },
      PushManager: function () {},
      Notification: { requestPermission, permission: "default" },
    } as unknown as import("./web-push-client.js").MinimalWindow;
    vi.stubGlobal("window", fakeWin);
    vi.stubGlobal("navigator", fakeWin.navigator);
    vi.stubGlobal("Notification", (fakeWin as unknown as { Notification: unknown }).Notification);
    try {
      const out = await enableWebPush({
        fetchVapidKey: async () => "x",
        postSubscription: async () => ({ ok: true }),
      });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toBe("denied");
      expect(requestPermission).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns reason='no_vapid_key' when the API returns null", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const fakeWin = {
      navigator: {
        serviceWorker: {
          register: vi.fn().mockResolvedValue({
            pushManager: { subscribe: vi.fn() },
          }),
          ready: Promise.resolve(),
        },
      },
      PushManager: function () {},
      Notification: { requestPermission },
    } as unknown as import("./web-push-client.js").MinimalWindow;
    vi.stubGlobal("window", fakeWin);
    vi.stubGlobal("navigator", fakeWin.navigator);
    vi.stubGlobal("Notification", (fakeWin as unknown as { Notification: unknown }).Notification);
    try {
      const out = await enableWebPush({
        fetchVapidKey: async () => null,
        postSubscription: async () => ({ ok: true }),
      });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toBe("no_vapid_key");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns ok=true + the serialized subscription on full happy path", async () => {
    const fakeSubscription = {
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/ok",
        keys: { p256dh: "p", auth: "a" },
      }),
    } as unknown as PushSubscription;
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const subscribe = vi.fn().mockResolvedValue(fakeSubscription);
    const register = vi.fn().mockResolvedValue({ pushManager: { subscribe } });
    const post = vi.fn().mockResolvedValue({ ok: true });
    const fakeWin = {
      navigator: { serviceWorker: { register, ready: Promise.resolve() } },
      PushManager: function () {},
      Notification: { requestPermission },
    } as unknown as import("./web-push-client.js").MinimalWindow;
    vi.stubGlobal("window", fakeWin);
    vi.stubGlobal("navigator", fakeWin.navigator);
    vi.stubGlobal("Notification", (fakeWin as unknown as { Notification: unknown }).Notification);
    try {
      const out = await enableWebPush({
        fetchVapidKey: async () => "BFakeKey",
        postSubscription: post,
      });
      expect(out.ok).toBe(true);
      const expected: SubscriptionPayload = {
        endpoint: "https://fcm.googleapis.com/fcm/send/ok",
        keys: { p256dh: "p", auth: "a" },
      };
      if (out.ok) expect(out.subscription).toEqual(expected);
      expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
      expect(subscribe).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: expect.any(ArrayBuffer),
      });
      expect(post).toHaveBeenCalledWith(expected);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns reason='subscribe_failed' when the API rejects the subscription POST", async () => {
    const fakeSubscription = {
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/ok",
        keys: { p256dh: "p", auth: "a" },
      }),
    } as unknown as PushSubscription;
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const subscribe = vi.fn().mockResolvedValue(fakeSubscription);
    const register = vi.fn().mockResolvedValue({ pushManager: { subscribe } });
    const fakeWin = {
      navigator: { serviceWorker: { register, ready: Promise.resolve() } },
      PushManager: function () {},
      Notification: { requestPermission },
    } as unknown as import("./web-push-client.js").MinimalWindow;
    vi.stubGlobal("window", fakeWin);
    vi.stubGlobal("navigator", fakeWin.navigator);
    vi.stubGlobal("Notification", (fakeWin as unknown as { Notification: unknown }).Notification);
    try {
      const out = await enableWebPush({
        fetchVapidKey: async () => "BFakeKey",
        postSubscription: async () => ({ ok: false }),
      });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toBe("subscribe_failed");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
