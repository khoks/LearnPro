import { describe, expect, it, vi } from "vitest";
import type { NotificationInput } from "./channel.js";
import {
  processDeferredNotifications,
  type DueDeferredRow,
  type ProcessDispatcherLike,
} from "./deferred-flusher.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function fakeDispatcher(behaviour: "deliver" | "throw" = "deliver"): {
  dispatcher: ProcessDispatcherLike;
  calls: NotificationInput[];
} {
  const calls: NotificationInput[] = [];
  return {
    calls,
    dispatcher: {
      async dispatch(input) {
        calls.push(input);
        if (behaviour === "throw") throw new Error("dispatcher boom");
        return {
          input,
          results: [{ channel: "in_app", delivered: true }],
          any_delivered: true,
        };
      },
    },
  };
}

describe("processDeferredNotifications", () => {
  it("dispatches every due row + deletes each one + reports counts", async () => {
    const due: DueDeferredRow[] = [
      { id: "r1", user_id: USER_ID, payload: { title: "first" } },
      { id: "r2", user_id: USER_ID, payload: { title: "second", body: "body" } },
    ];
    const deleted: string[] = [];
    const { dispatcher, calls } = fakeDispatcher();
    const out = await processDeferredNotifications({
      listDue: async () => due,
      deleteRow: async (id) => {
        deleted.push(id);
        return true;
      },
      dispatcher,
      now: new Date("2026-05-02T08:30:00Z"),
      log: () => {},
    });
    expect(out.processed).toBe(2);
    expect(out.delivered).toBe(2);
    expect(out.malformed).toBe(0);
    expect(out.errored).toBe(0);
    expect(deleted).toEqual(["r1", "r2"]);
    expect(calls.map((c) => c.title)).toEqual(["first", "second"]);
  });

  it("returns empty counts when there are no due rows", async () => {
    const out = await processDeferredNotifications({
      listDue: async () => [],
      deleteRow: vi.fn(),
      dispatcher: fakeDispatcher().dispatcher,
      log: () => {},
    });
    expect(out.processed).toBe(0);
    expect(out.delivered).toBe(0);
  });

  it("drops malformed rows + still deletes them so the table can't poison itself", async () => {
    const due: DueDeferredRow[] = [
      { id: "bad", user_id: USER_ID, payload: { /* missing title */ body: "x" } },
    ];
    const deleted: string[] = [];
    const { dispatcher, calls } = fakeDispatcher();
    const out = await processDeferredNotifications({
      listDue: async () => due,
      deleteRow: async (id) => {
        deleted.push(id);
        return true;
      },
      dispatcher,
      log: () => {},
    });
    expect(out.malformed).toBe(1);
    expect(out.delivered).toBe(0);
    expect(deleted).toEqual(["bad"]);
    expect(calls).toHaveLength(0);
  });

  it("counts dispatcher errors + still deletes the row (re-deferral is the dispatcher's job)", async () => {
    const due: DueDeferredRow[] = [{ id: "r1", user_id: USER_ID, payload: { title: "x" } }];
    const deleted: string[] = [];
    const { dispatcher } = fakeDispatcher("throw");
    const out = await processDeferredNotifications({
      listDue: async () => due,
      deleteRow: async (id) => {
        deleted.push(id);
        return true;
      },
      dispatcher,
      log: () => {},
    });
    expect(out.errored).toBe(1);
    expect(out.delivered).toBe(0);
    expect(deleted).toEqual(["r1"]);
  });

  it("forwards dedupe_key / metadata from the stored payload to the dispatched input", async () => {
    const due: DueDeferredRow[] = [
      {
        id: "r1",
        user_id: USER_ID,
        payload: {
          title: "Time to practice",
          dedupe_key: "daily-20260501",
          metadata: { url: "/dashboard" },
        },
      },
    ];
    const { dispatcher, calls } = fakeDispatcher();
    await processDeferredNotifications({
      listDue: async () => due,
      deleteRow: async () => true,
      dispatcher,
      log: () => {},
    });
    expect(calls[0]?.dedupe_key).toBe("daily-20260501");
    expect(calls[0]?.metadata).toEqual({ url: "/dashboard" });
  });

  it("default limit is 100 (passes through to listDue)", async () => {
    const listDue = vi.fn(async () => []);
    await processDeferredNotifications({
      listDue,
      deleteRow: vi.fn(),
      dispatcher: fakeDispatcher().dispatcher,
      log: () => {},
    });
    expect(listDue).toHaveBeenCalledWith(expect.any(Date), 100);
  });

  it("respects a custom limit override", async () => {
    const listDue = vi.fn(async () => []);
    await processDeferredNotifications({
      listDue,
      deleteRow: vi.fn(),
      dispatcher: fakeDispatcher().dispatcher,
      limit: 25,
      log: () => {},
    });
    expect(listDue).toHaveBeenCalledWith(expect.any(Date), 25);
  });
});
