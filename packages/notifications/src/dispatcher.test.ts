import { describe, expect, it, vi } from "vitest";
import type {
  NotificationChannel,
  NotificationDeliveryResult,
  NotificationInput,
} from "./channel.js";
import { NotificationDispatcher } from "./dispatcher.js";

function fakeChannel(
  name: NotificationChannel["name"],
  result: NotificationDeliveryResult,
  spy = vi.fn(),
): NotificationChannel & { calls: NotificationInput[] } {
  const calls: NotificationInput[] = [];
  return {
    name,
    calls,
    async send(input: NotificationInput) {
      calls.push(input);
      spy(input);
      return result;
    },
  };
}

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("NotificationDispatcher", () => {
  it("validates input via NotificationInputSchema before any channel is touched", async () => {
    const ch = fakeChannel("in_app", { delivered: true });
    const d = new NotificationDispatcher({ channels: [ch] });
    await expect(
      // bad uuid
      d.dispatch({ user_id: "nope", title: "x" } as unknown as NotificationInput),
    ).rejects.toThrow();
    expect(ch.calls).toHaveLength(0);
  });

  it("fans out to every channel when shouldDeliverNow returns true", async () => {
    const a = fakeChannel("in_app", { delivered: true });
    const b = fakeChannel("web_push", { delivered: true });
    const d = new NotificationDispatcher({ channels: [a, b] });
    const out = await d.dispatch({ user_id: USER_ID, title: "x" });
    expect(out.any_delivered).toBe(true);
    expect(out.results.map((r) => r.channel)).toEqual(["in_app", "web_push"]);
    expect(a.calls).toHaveLength(1);
    expect(b.calls).toHaveLength(1);
  });

  it("collapses to per-channel quiet_hours when shouldDeliverNow returns false", async () => {
    const a = fakeChannel("in_app", { delivered: true });
    const b = fakeChannel("web_push", { delivered: true });
    const d = new NotificationDispatcher({
      channels: [a, b],
      shouldDeliverNow: () => false,
    });
    const out = await d.dispatch({ user_id: USER_ID, title: "x" });
    expect(out.any_delivered).toBe(false);
    expect(out.results.every((r) => r.reason === "quiet_hours")).toBe(true);
    expect(a.calls).toHaveLength(0);
    expect(b.calls).toHaveLength(0);
  });

  it("skips channels not in the `channels` filter", async () => {
    const a = fakeChannel("in_app", { delivered: true });
    const b = fakeChannel("web_push", { delivered: true });
    const d = new NotificationDispatcher({ channels: [a, b] });
    const out = await d.dispatch({ user_id: USER_ID, title: "x" }, { channels: ["web_push"] });
    expect(a.calls).toHaveLength(0);
    expect(b.calls).toHaveLength(1);
    expect(out.results.find((r) => r.channel === "in_app")?.reason).toBe("filtered");
  });

  it("any_delivered=true if at least one channel delivered", async () => {
    const a = fakeChannel("in_app", { delivered: false, reason: "duplicate" });
    const b = fakeChannel("web_push", { delivered: true });
    const d = new NotificationDispatcher({ channels: [a, b] });
    const out = await d.dispatch({ user_id: USER_ID, title: "x" });
    expect(out.any_delivered).toBe(true);
  });

  it("any_delivered=false when every channel reports non-delivery", async () => {
    const a = fakeChannel("in_app", { delivered: false, reason: "duplicate" });
    const b = fakeChannel("web_push", { delivered: false, reason: "no_subscriptions" });
    const d = new NotificationDispatcher({ channels: [a, b] });
    const out = await d.dispatch({ user_id: USER_ID, title: "x" });
    expect(out.any_delivered).toBe(false);
  });

  it("a thrown channel error becomes delivered=false reason='channel_threw' (does not block siblings)", async () => {
    const a: NotificationChannel = {
      name: "in_app",
      async send() {
        throw new Error("boom");
      },
    };
    const b = fakeChannel("web_push", { delivered: true });
    const d = new NotificationDispatcher({ channels: [a, b], log: () => {} });
    const out = await d.dispatch({ user_id: USER_ID, title: "x" });
    expect(out.results[0]).toEqual({
      channel: "in_app",
      delivered: false,
      reason: "channel_threw",
    });
    expect(out.results[1]).toEqual({ channel: "web_push", delivered: true });
    expect(b.calls).toHaveLength(1);
  });

  it("the quiet-hours hook receives (user_id, now)", async () => {
    const hook = vi.fn().mockResolvedValue(true);
    const ch = fakeChannel("in_app", { delivered: true });
    const d = new NotificationDispatcher({ channels: [ch], shouldDeliverNow: hook });
    const fixedNow = new Date("2026-05-01T12:00:00Z");
    await d.dispatch({ user_id: USER_ID, title: "x" }, { now: fixedNow });
    expect(hook).toHaveBeenCalledWith(USER_ID, fixedNow);
  });
});
