import type { InteractionEvent } from "@learnpro/shared";
import { describe, expect, it } from "vitest";
import { CursorFocusTracker, RevertDetector } from "./interaction-capture";

describe("CursorFocusTracker", () => {
  it("emits a cursor_focus event for the previous region only when it sat for >= minDurationMs", () => {
    const events: InteractionEvent[] = [];
    const t = new CursorFocusTracker(200);
    t.onCursorChange({ line_start: 1, line_end: 1 }, 0, (e) => events.push(e));
    expect(events).toHaveLength(0); // first observation, nothing to emit yet

    // moved away after 250 ms — eligible to emit for line 1
    t.onCursorChange({ line_start: 5, line_end: 5 }, 250, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("cursor_focus");
    expect(events[0]!.payload).toMatchObject({ line_start: 1, line_end: 1, duration_ms: 250 });
  });

  it("does NOT emit for a region that the cursor only brushed (under threshold)", () => {
    const events: InteractionEvent[] = [];
    const t = new CursorFocusTracker(200);
    t.onCursorChange({ line_start: 1, line_end: 1 }, 0, (e) => events.push(e));
    t.onCursorChange({ line_start: 2, line_end: 2 }, 50, (e) => events.push(e));
    expect(events).toHaveLength(0);
  });

  it("ignores no-op cursor changes (same region reported twice in a row)", () => {
    const events: InteractionEvent[] = [];
    const t = new CursorFocusTracker(50);
    t.onCursorChange({ line_start: 1, line_end: 1 }, 0, (e) => events.push(e));
    t.onCursorChange({ line_start: 1, line_end: 1 }, 100, (e) => events.push(e));
    t.onCursorChange({ line_start: 1, line_end: 1 }, 200, (e) => events.push(e));
    t.onCursorChange({ line_start: 5, line_end: 5 }, 300, (e) => events.push(e));
    // a single emission for the line 1 region (0 → 300 ms)
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ line_start: 1, duration_ms: 300 });
  });

  it("flush() emits the current region (e.g. on blur / unmount)", () => {
    const events: InteractionEvent[] = [];
    const t = new CursorFocusTracker(100);
    t.onCursorChange({ line_start: 1, line_end: 1 }, 0, (e) => events.push(e));
    t.flush(500, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ duration_ms: 500 });
  });

  it("propagates file / function metadata when supplied", () => {
    const events: InteractionEvent[] = [];
    const t = new CursorFocusTracker(50);
    t.onCursorChange(
      { line_start: 4, line_end: 7, file: "main.py", function: "fizzbuzz" },
      0,
      (e) => events.push(e),
    );
    t.onCursorChange({ line_start: 99, line_end: 99 }, 100, (e) => events.push(e));
    const payload = events[0]!.payload as Record<string, unknown>;
    expect(payload["file"]).toBe("main.py");
    expect(payload["function"]).toBe("fizzbuzz");
  });
});

describe("RevertDetector", () => {
  const range = { start_line: 1, start_col: 0, end_line: 1, end_col: 5 };

  it("emits an `edit` for a forward change", () => {
    const events: InteractionEvent[] = [];
    const d = new RevertDetector();
    d.onEdit("x = 1", "x = 2", range, 0, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("edit");
  });

  it("emits a `revert` when the user undoes a recent edit", () => {
    const events: InteractionEvent[] = [];
    const d = new RevertDetector();
    d.onEdit("x = 1", "x = 2", range, 0, (e) => events.push(e));
    d.onEdit("x = 2", "x = 1", range, 1000, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(["edit", "revert"]);
    expect(events[1]!.payload).toMatchObject({ original: "x = 2", current_after_revert: "x = 1" });
  });

  it("does NOT call a revert if the snapshot is older than windowMs", () => {
    const events: InteractionEvent[] = [];
    const d = new RevertDetector(10_000);
    d.onEdit("x = 1", "x = 2", range, 0, (e) => events.push(e));
    d.onEdit("x = 2", "x = 1", range, 60_000, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(["edit", "edit"]);
  });

  it("doesn't double-fire a revert against the same matched snapshot", () => {
    const events: InteractionEvent[] = [];
    const d = new RevertDetector();
    d.onEdit("A", "B", range, 0, (e) => events.push(e)); // edit (snapshot of A)
    d.onEdit("B", "A", range, 100, (e) => events.push(e)); // revert (snapshot of A consumed)
    d.onEdit("A", "B", range, 200, (e) => events.push(e)); // edit again — fresh snapshot of A
    d.onEdit("B", "A", range, 300, (e) => events.push(e)); // revert against the new snapshot
    expect(events.map((e) => e.type)).toEqual(["edit", "revert", "edit", "revert"]);
  });

  it("treats a no-op edit (prev === next) as not a revert", () => {
    const events: InteractionEvent[] = [];
    const d = new RevertDetector();
    d.onEdit("hello", "hello", range, 0, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("edit");
  });

  it("caps snapshot buffer to maxSnapshots so a marathon session can't OOM the tab", () => {
    const events: InteractionEvent[] = [];
    const d = new RevertDetector(60_000, 4);
    for (let i = 0; i < 10; i++) {
      d.onEdit(`s${i}`, `s${i + 1}`, range, i, (e) => events.push(e));
    }
    expect(d.snapshotCount()).toBeLessThanOrEqual(4);
  });
});
