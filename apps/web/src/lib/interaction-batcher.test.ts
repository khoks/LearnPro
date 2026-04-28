import type { InteractionsBatch } from "@learnpro/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InteractionBatcher } from "./interaction-batcher";

describe("InteractionBatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buffers events and flushes after the idle window", async () => {
    const send = vi.fn(async (_b: InteractionsBatch) => {});
    const batcher = new InteractionBatcher({ flushIntervalMs: 200, send });
    batcher.enqueue({ type: "submit", payload: { passed: true } });
    expect(send).not.toHaveBeenCalled();
    expect(batcher.pendingCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].events).toHaveLength(1);
    expect(batcher.pendingCount()).toBe(0);
  });

  it("flushes immediately when the buffer hits maxBatchSize (back-pressure)", async () => {
    const send = vi.fn(async (_b: InteractionsBatch) => {});
    const batcher = new InteractionBatcher({ maxBatchSize: 3, flushIntervalMs: 9999, send });
    batcher.enqueue({ type: "submit", payload: { passed: true } });
    batcher.enqueue({ type: "submit", payload: { passed: true } });
    expect(send).not.toHaveBeenCalled();
    batcher.enqueue({ type: "submit", payload: { passed: true } });
    // Synchronous from the caller's perspective; the send() promise is fire-and-forget.
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].events).toHaveLength(3);
  });

  it("manual flush() drains the queue immediately and cancels the pending timer", async () => {
    const send = vi.fn(async (_b: InteractionsBatch) => {});
    const batcher = new InteractionBatcher({ flushIntervalMs: 5000, send });
    batcher.enqueue({ type: "submit", payload: { passed: true } });
    batcher.enqueue({ type: "run", payload: { language: "python", exit_code: 0 } });

    await batcher.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].events).toHaveLength(2);

    // Advancing past the (now-cancelled) idle window must not fire a second send.
    await vi.advanceTimersByTimeAsync(10000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("flush() with an empty queue is a no-op (no network round-trip)", async () => {
    const send = vi.fn(async (_b: InteractionsBatch) => {});
    const batcher = new InteractionBatcher({ flushIntervalMs: 200, send });
    await batcher.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("swallows send errors so a flaky network can't break the editor", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn(async () => {
      throw new Error("offline");
    });
    const batcher = new InteractionBatcher({ flushIntervalMs: 50, send });
    batcher.enqueue({ type: "submit", payload: { passed: true } });
    await vi.advanceTimersByTimeAsync(50);
    expect(send).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("destroy() drops the buffer and ignores subsequent enqueues", async () => {
    const send = vi.fn(async (_b: InteractionsBatch) => {});
    const batcher = new InteractionBatcher({ flushIntervalMs: 100, send });
    batcher.enqueue({ type: "submit", payload: { passed: true } });
    batcher.destroy();
    batcher.enqueue({ type: "submit", payload: { passed: true } });
    await vi.advanceTimersByTimeAsync(500);
    expect(send).not.toHaveBeenCalled();
    expect(batcher.pendingCount()).toBe(0);
  });

  it("clamps maxBatchSize to the protocol cap (server-side max is the hard limit)", async () => {
    const send = vi.fn(async (_b: InteractionsBatch) => {});
    const batcher = new InteractionBatcher({ maxBatchSize: 9999, flushIntervalMs: 50, send });
    // 250 enqueues — should produce at least 2 batches because the per-batch cap clamps to 200.
    for (let i = 0; i < 250; i++) {
      batcher.enqueue({ type: "submit", payload: { passed: true } });
    }
    await vi.advanceTimersByTimeAsync(100);
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(2);
    const total = send.mock.calls.reduce((sum, [b]) => sum + (b?.events.length ?? 0), 0);
    expect(total).toBe(250);
    for (const [b] of send.mock.calls) {
      expect(b!.events.length).toBeLessThanOrEqual(200);
    }
  });
});
