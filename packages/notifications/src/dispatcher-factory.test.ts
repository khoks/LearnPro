import { DEFAULT_QUIET_HOURS_CONFIG, type QuietHoursConfig } from "@learnpro/scoring";
import { describe, expect, it, vi } from "vitest";
import type {
  NotificationChannel,
  NotificationDeliveryResult,
  NotificationInput,
} from "./channel.js";
import {
  dispatcherWithQuietHours,
  QuietHoursDispatcher,
  type DeferDeliveryFn,
} from "./dispatcher-factory.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const enabledConfig: QuietHoursConfig = { ...DEFAULT_QUIET_HOURS_CONFIG };
const disabledConfig: QuietHoursConfig = { ...DEFAULT_QUIET_HOURS_CONFIG, enabled: false };

function fakeChannel(
  name: NotificationChannel["name"],
  result: NotificationDeliveryResult = { delivered: true },
): NotificationChannel & { calls: NotificationInput[] } {
  const calls: NotificationInput[] = [];
  return {
    name,
    calls,
    async send(input: NotificationInput) {
      calls.push(input);
      return result;
    },
  };
}

describe("dispatcherWithQuietHours — outside quiet hours", () => {
  it("delegates to the inner dispatcher and fans out", async () => {
    const a = fakeChannel("in_app");
    const b = fakeChannel("web_push");
    const defer = vi.fn<DeferDeliveryFn>();
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a, b],
      getQuietHoursConfig: async () => disabledConfig,
      deferDelivery: defer,
      log: () => {},
    });
    const out = await dispatcher.dispatch(
      { user_id: USER_ID, title: "x" },
      { now: new Date("2026-05-01T23:00:00Z") },
    );
    expect(out.any_delivered).toBe(true);
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
    expect(defer).not.toHaveBeenCalled();
  });

  it("with enabled config but `now` outside the window, still delivers", async () => {
    const a = fakeChannel("in_app");
    const defer = vi.fn();
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a],
      getQuietHoursConfig: async () => enabledConfig,
      deferDelivery: defer,
      log: () => {},
    });
    // 12:00 UTC is well outside the default 22→08 UTC window.
    const out = await dispatcher.dispatch(
      { user_id: USER_ID, title: "x" },
      { now: new Date("2026-05-01T12:00:00Z") },
    );
    expect(out.any_delivered).toBe(true);
    expect(a.calls).toHaveLength(1);
    expect(defer).not.toHaveBeenCalled();
  });
});

describe("dispatcherWithQuietHours — inside quiet hours", () => {
  it("does NOT call any channel and reports per-channel quiet_hours", async () => {
    const a = fakeChannel("in_app");
    const b = fakeChannel("web_push");
    const defer = vi.fn();
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a, b],
      getQuietHoursConfig: async () => enabledConfig,
      deferDelivery: defer,
      log: () => {},
    });
    const out = await dispatcher.dispatch(
      { user_id: USER_ID, title: "x" },
      { now: new Date("2026-05-01T23:00:00Z") },
    );
    expect(out.any_delivered).toBe(false);
    expect(out.results.every((r) => r.reason === "quiet_hours")).toBe(true);
    expect(a.calls).toHaveLength(0);
    expect(b.calls).toHaveLength(0);
  });

  it("writes a deferred row with deliver_after = nextDeliveryTime (08:00 UTC next day)", async () => {
    const a = fakeChannel("in_app");
    const defer = vi.fn<DeferDeliveryFn>(async () => undefined);
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a],
      getQuietHoursConfig: async () => enabledConfig,
      deferDelivery: defer,
      log: () => {},
    });
    await dispatcher.dispatch(
      { user_id: USER_ID, title: "Time to practice", body: "When ready" },
      { now: new Date("2026-05-01T23:00:00Z") },
    );
    expect(defer).toHaveBeenCalledTimes(1);
    const call = defer.mock.calls[0]![0]!;
    expect(call.user_id).toBe(USER_ID);
    expect(call.payload.title).toBe("Time to practice");
    expect(call.payload.body).toBe("When ready");
    expect(call.deliver_after.toISOString()).toBe("2026-05-02T08:00:00.000Z");
  });

  it("forwards dedupe_key and metadata to the deferred row", async () => {
    const a = fakeChannel("in_app");
    const defer = vi.fn<DeferDeliveryFn>(async () => undefined);
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a],
      getQuietHoursConfig: async () => enabledConfig,
      deferDelivery: defer,
      log: () => {},
    });
    await dispatcher.dispatch(
      {
        user_id: USER_ID,
        title: "Time to practice",
        dedupe_key: "daily-20260501",
        metadata: { url: "/dashboard" },
      },
      { now: new Date("2026-05-01T23:00:00Z") },
    );
    const call = defer.mock.calls[0]![0]!;
    expect(call.payload.dedupe_key).toBe("daily-20260501");
    expect(call.payload.metadata).toEqual({ url: "/dashboard" });
  });

  it("for America/Los_Angeles, defers a 06:00-UTC dispatch until 15:00 UTC same day", async () => {
    const a = fakeChannel("in_app");
    const defer = vi.fn<DeferDeliveryFn>(async () => undefined);
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a],
      getQuietHoursConfig: async () => ({
        ...enabledConfig,
        timezone: "America/Los_Angeles",
      }),
      deferDelivery: defer,
      log: () => {},
    });
    await dispatcher.dispatch(
      { user_id: USER_ID, title: "x" },
      { now: new Date("2026-05-01T06:00:00Z") },
    );
    expect(a.calls).toHaveLength(0);
    const call = defer.mock.calls[0]![0]!;
    expect(call.deliver_after.toISOString()).toBe("2026-05-01T15:00:00.000Z");
  });

  it("for America/Los_Angeles, delivers a 23:00-UTC dispatch (= 16:00 PDT, outside window)", async () => {
    const a = fakeChannel("in_app");
    const defer = vi.fn();
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a],
      getQuietHoursConfig: async () => ({
        ...enabledConfig,
        timezone: "America/Los_Angeles",
      }),
      deferDelivery: defer,
      log: () => {},
    });
    const out = await dispatcher.dispatch(
      { user_id: USER_ID, title: "x" },
      { now: new Date("2026-05-01T23:00:00Z") },
    );
    expect(out.any_delivered).toBe(true);
    expect(a.calls).toHaveLength(1);
    expect(defer).not.toHaveBeenCalled();
  });
});

describe("dispatcherWithQuietHours — input validation + error paths", () => {
  it("rejects an invalid input via Zod parse before consulting quiet-hours", async () => {
    const a = fakeChannel("in_app");
    const getConfig = vi.fn<(user_id: string) => Promise<QuietHoursConfig>>(
      async () => enabledConfig,
    );
    const defer = vi.fn();
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a],
      getQuietHoursConfig: getConfig,
      deferDelivery: defer,
      log: () => {},
    });
    await expect(
      dispatcher.dispatch({ user_id: "not-a-uuid", title: "x" } as unknown as NotificationInput),
    ).rejects.toThrow();
    expect(getConfig).not.toHaveBeenCalled();
    expect(defer).not.toHaveBeenCalled();
    expect(a.calls).toHaveLength(0);
  });

  it("re-throws when the deferDelivery callback throws (anti-dark-pattern: never silently drop)", async () => {
    const a = fakeChannel("in_app");
    const defer = vi.fn<DeferDeliveryFn>(async () => {
      throw new Error("DB down");
    });
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a],
      getQuietHoursConfig: async () => enabledConfig,
      deferDelivery: defer,
      log: () => {},
    });
    await expect(
      dispatcher.dispatch(
        { user_id: USER_ID, title: "x" },
        { now: new Date("2026-05-01T23:00:00Z") },
      ),
    ).rejects.toThrow(/DB down/);
    expect(a.calls).toHaveLength(0);
  });

  it("propagates errors from getQuietHoursConfig", async () => {
    const a = fakeChannel("in_app");
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a],
      getQuietHoursConfig: async () => {
        throw new Error("config lookup failed");
      },
      deferDelivery: vi.fn(),
      log: () => {},
    });
    await expect(dispatcher.dispatch({ user_id: USER_ID, title: "x" })).rejects.toThrow(
      /config lookup failed/,
    );
  });
});

describe("dispatcherWithQuietHours — channel filter still works", () => {
  it("respects the `channels` filter when delivering (outside-window path)", async () => {
    const a = fakeChannel("in_app");
    const b = fakeChannel("web_push");
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a, b],
      getQuietHoursConfig: async () => disabledConfig,
      deferDelivery: vi.fn(),
      log: () => {},
    });
    const out = await dispatcher.dispatch(
      { user_id: USER_ID, title: "x" },
      { channels: ["web_push"] },
    );
    expect(a.calls).toHaveLength(0);
    expect(b.calls).toHaveLength(1);
    expect(out.results.find((r) => r.channel === "in_app")?.reason).toBe("filtered");
  });
});

describe("QuietHoursDispatcher — class-shape parity with NotificationDispatcher", () => {
  it("dispatch returns the same `input / results / any_delivered` shape", async () => {
    const a = fakeChannel("in_app");
    const wrapper = new QuietHoursDispatcher({
      channels: [a],
      getQuietHoursConfig: async () => disabledConfig,
      deferDelivery: vi.fn(),
      log: () => {},
    });
    const out = await wrapper.dispatch({ user_id: USER_ID, title: "x" });
    expect(Object.keys(out).sort()).toEqual(["any_delivered", "input", "results"]);
  });
});

describe("dispatcherWithQuietHours — multiple sequential dispatches don't leak state", () => {
  it("a second dispatch with a different user re-evaluates getQuietHoursConfig", async () => {
    const a = fakeChannel("in_app");
    const getConfig = vi.fn<(user_id: string) => Promise<QuietHoursConfig>>(async (user_id) => {
      if (user_id === USER_ID) return enabledConfig;
      return disabledConfig;
    });
    const defer = vi.fn<DeferDeliveryFn>(async () => undefined);
    const { dispatcher } = dispatcherWithQuietHours({
      channels: [a],
      getQuietHoursConfig: getConfig,
      deferDelivery: defer,
      log: () => {},
    });
    await dispatcher.dispatch(
      { user_id: USER_ID, title: "in window" },
      { now: new Date("2026-05-01T23:00:00Z") },
    );
    await dispatcher.dispatch(
      {
        user_id: "22222222-2222-2222-2222-222222222222",
        title: "out of window — disabled",
      },
      { now: new Date("2026-05-01T23:00:00Z") },
    );
    expect(getConfig).toHaveBeenCalledTimes(2);
    expect(defer).toHaveBeenCalledTimes(1);
    expect(a.calls).toHaveLength(1);
    expect(a.calls[0]?.title).toBe("out of window — disabled");
  });
});
