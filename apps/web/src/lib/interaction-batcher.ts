import {
  MAX_INTERACTIONS_PER_BATCH,
  type InteractionEvent,
  type InteractionsBatch,
} from "@learnpro/shared";

export interface InteractionBatcherOptions {
  /** Max events to buffer before forcing a flush. Defaults to MAX_INTERACTIONS_PER_BATCH. */
  maxBatchSize?: number;
  /** Idle window before an auto-flush (ms). Defaults to 2000. */
  flushIntervalMs?: number;
  /** Override the network call (mostly for tests). Defaults to `fetch("/api/interactions", ...)`. */
  send?: (batch: InteractionsBatch) => Promise<void>;
  /** Override the timer (jsdom / node fake-timer friendly). Defaults to global setTimeout/clearTimeout. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

// Buffers `InteractionEvent`s and flushes them as a single POST. Two flush triggers:
//   1. Buffer reaches `maxBatchSize` — fire immediately (back-pressure on a busy session).
//   2. `flushIntervalMs` of idle since the last `enqueue()` — fire so a quiet user's events
//      don't sit in memory until they refresh the tab.
//
// Flush is deliberately fire-and-forget from the caller's perspective: errors are logged but
// never surfaced to the typing-user (the editor can't go down because the network is flaky).
// `flush()` is exposed so the page can flush on visibility-hidden / pagehide.
export class InteractionBatcher {
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly send: (batch: InteractionsBatch) => Promise<void>;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private queue: InteractionEvent[] = [];
  private timer: unknown = null;
  private destroyed = false;

  constructor(opts: InteractionBatcherOptions = {}) {
    this.maxBatchSize = clamp(
      opts.maxBatchSize ?? MAX_INTERACTIONS_PER_BATCH,
      1,
      MAX_INTERACTIONS_PER_BATCH,
    );
    this.flushIntervalMs = Math.max(50, opts.flushIntervalMs ?? 2000);
    this.send = opts.send ?? defaultSend;
    this.setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  enqueue(event: InteractionEvent): void {
    if (this.destroyed) return;
    this.queue.push(event);
    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
      return;
    }
    this.scheduleFlush();
  }

  // Drain the buffer right now. Returns the promise so callers (like a beforeunload handler) can
  // await it if they care to. No-op when the queue is empty.
  async flush(): Promise<void> {
    this.cancelTimer();
    if (this.queue.length === 0) return;
    const batch: InteractionsBatch = { events: this.queue };
    this.queue = [];
    try {
      await this.send(batch);
    } catch (err) {
      // Telemetry is non-critical: log and drop. We deliberately don't requeue — a long offline
      // session shouldn't grow an unbounded buffer in memory.
      // eslint-disable-next-line no-console
      console.warn("[interaction-batcher] send failed", err);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelTimer();
    this.queue = [];
  }

  /** Test-only — peek at the buffer without flushing. */
  pendingCount(): number {
    return this.queue.length;
  }

  private scheduleFlush(): void {
    if (this.timer !== null) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }
}

async function defaultSend(batch: InteractionsBatch): Promise<void> {
  const res = await fetch("/api/interactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(batch),
    // Best-effort delivery on tab close: keepalive so the browser doesn't cancel the request.
    keepalive: true,
  });
  if (!res.ok) {
    throw new Error(`interactions endpoint replied ${res.status}`);
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
