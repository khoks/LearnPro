import type { LearnProDb, NewNotification, Notification } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InAppChannel } from "./in-app-channel.js";

// `findRecentDuplicate` is the only @learnpro/db function the channel calls beyond `db.insert`.
// Mock it inline so the test runs without Postgres.
const findRecentDuplicate = vi.fn();
vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    findRecentDuplicate: (...args: Parameters<typeof actual.findRecentDuplicate>) =>
      findRecentDuplicate(...args),
  };
});

interface InsertCapture {
  values: NewNotification[];
}

function makeFakeDb(): { db: LearnProDb; captures: InsertCapture[] } {
  const captures: InsertCapture[] = [];
  // Cast through unknown — we don't use the full Drizzle surface.
  const db = {
    insert: () => ({
      values: (rows: NewNotification[] | NewNotification) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        captures.push({ values: arr });
        return Promise.resolve();
      },
    }),
  } as unknown as LearnProDb;
  return { db, captures };
}

describe("InAppChannel", () => {
  beforeEach(() => {
    findRecentDuplicate.mockReset();
  });

  afterEach(() => {
    findRecentDuplicate.mockReset();
  });

  it("inserts a row and returns delivered=true", async () => {
    const { db, captures } = makeFakeDb();
    const ch = new InAppChannel({ db });
    findRecentDuplicate.mockResolvedValue(null);
    const out = await ch.send({
      user_id: "11111111-1111-1111-1111-111111111111",
      title: "Time to practice",
      body: "A short session keeps your reps warm.",
    });
    expect(out).toEqual({ delivered: true });
    expect(captures).toHaveLength(1);
    const row = captures[0]!.values[0]!;
    expect(row.user_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(row.channel).toBe("in_app");
    expect(row.title).toBe("Time to practice");
    expect(row.body).toBe("A short session keeps your reps warm.");
    expect(row.org_id).toBe("self");
  });

  it("does not query findRecentDuplicate when no dedupe_key is supplied", async () => {
    const { db, captures } = makeFakeDb();
    const ch = new InAppChannel({ db });
    await ch.send({
      user_id: "11111111-1111-1111-1111-111111111111",
      title: "x",
    });
    expect(findRecentDuplicate).not.toHaveBeenCalled();
    expect(captures).toHaveLength(1);
  });

  it("skips the insert when a duplicate exists in the dedupe window", async () => {
    const { db, captures } = makeFakeDb();
    findRecentDuplicate.mockResolvedValue({
      id: "existing-id",
      user_id: "11111111-1111-1111-1111-111111111111",
      channel: "in_app",
      title: "Time to practice",
      body: null,
      sent_at: new Date(),
      read_at: null,
      org_id: "self",
      dedupe_key: "daily-20260501",
    } satisfies Notification);
    const ch = new InAppChannel({ db });
    const out = await ch.send({
      user_id: "11111111-1111-1111-1111-111111111111",
      title: "Time to practice",
      dedupe_key: "daily-20260501",
    });
    expect(out).toEqual({ delivered: false, reason: "duplicate" });
    expect(captures).toHaveLength(0);
  });

  it("inserts when dedupe_key is set but no duplicate exists in the window", async () => {
    const { db, captures } = makeFakeDb();
    findRecentDuplicate.mockResolvedValue(null);
    const ch = new InAppChannel({ db });
    const out = await ch.send({
      user_id: "11111111-1111-1111-1111-111111111111",
      title: "Time to practice",
      dedupe_key: "daily-20260501",
    });
    expect(out).toEqual({ delivered: true });
    expect(captures).toHaveLength(1);
    expect(captures[0]!.values[0]!.dedupe_key).toBe("daily-20260501");
  });

  it("respects a custom org_id", async () => {
    const { db, captures } = makeFakeDb();
    const ch = new InAppChannel({ db, org_id: "tenant-42" });
    await ch.send({
      user_id: "11111111-1111-1111-1111-111111111111",
      title: "x",
    });
    expect(captures[0]!.values[0]!.org_id).toBe("tenant-42");
  });

  it("uses a custom now() for the row's sent_at + dedupe-window probe", async () => {
    const { db, captures } = makeFakeDb();
    const fixed = new Date("2026-05-01T12:00:00Z");
    const ch = new InAppChannel({ db, now: () => fixed });
    findRecentDuplicate.mockResolvedValue(null);
    await ch.send({
      user_id: "11111111-1111-1111-1111-111111111111",
      title: "x",
      dedupe_key: "k",
    });
    expect(captures[0]!.values[0]!.sent_at).toEqual(fixed);
    const args = findRecentDuplicate.mock.calls[0]?.[0];
    expect(args?.now).toEqual(fixed);
  });

  it("channel name is the literal 'in_app'", () => {
    const { db } = makeFakeDb();
    const ch = new InAppChannel({ db });
    expect(ch.name).toBe("in_app");
  });
});
