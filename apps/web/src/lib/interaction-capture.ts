import type { InteractionEvent } from "@learnpro/shared";

export interface CursorRegion {
  line_start: number;
  line_end: number;
  file?: string;
  function?: string;
}

export interface InteractionRange {
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
}

// Stays-in-region debouncer: emits a `cursor_focus` event for the *previous* region only when
// the cursor sat there for at least `minDurationMs`. The pure logic lives here; the React
// hook calls these methods from Monaco's onDidChangeCursorPosition / onDidChangeModelContent.
export class CursorFocusTracker {
  private current: CursorRegion | null = null;
  private since = 0;
  private readonly minDurationMs: number;

  constructor(minDurationMs = 200) {
    this.minDurationMs = Math.max(0, minDurationMs);
  }

  onCursorChange(next: CursorRegion, now: number, emit: (e: InteractionEvent) => void): void {
    if (this.current && sameRegion(this.current, next)) return;
    this.flushInto(now, emit);
    this.current = next;
    this.since = now;
  }

  flush(now: number, emit: (e: InteractionEvent) => void): void {
    this.flushInto(now, emit);
    this.current = null;
    this.since = 0;
  }

  private flushInto(now: number, emit: (e: InteractionEvent) => void): void {
    if (!this.current) return;
    const duration = Math.max(0, now - this.since);
    if (duration < this.minDurationMs) return;
    const region = this.current;
    emit({
      type: "cursor_focus",
      payload: {
        line_start: region.line_start,
        line_end: region.line_end,
        duration_ms: duration,
        ...(region.file !== undefined && { file: region.file }),
        ...(region.function !== undefined && { function: region.function }),
      },
    });
  }
}

function sameRegion(a: CursorRegion, b: CursorRegion): boolean {
  return (
    a.line_start === b.line_start &&
    a.line_end === b.line_end &&
    a.file === b.file &&
    a.function === b.function
  );
}

// Sliding-window revert detector: every edit pushes a snapshot of the *pre-edit* text. On a
// later edit, if the new text matches any snapshot inside `windowMs`, we emit a revert event
// (the user undid a recent change). Snapshots older than the window are pruned on each call.
export class RevertDetector {
  private readonly windowMs: number;
  private readonly maxSnapshots: number;
  private snapshots: Array<{ text: string; t: number }> = [];

  constructor(windowMs = 30_000, maxSnapshots = 64) {
    this.windowMs = Math.max(1000, windowMs);
    this.maxSnapshots = Math.max(2, maxSnapshots);
  }

  onEdit(
    prev: string,
    next: string,
    range: InteractionRange,
    now: number,
    emit: (e: InteractionEvent) => void,
  ): void {
    const cutoff = now - this.windowMs;
    this.snapshots = this.snapshots.filter((s) => s.t >= cutoff);

    const reverted = this.snapshots.find((s) => s.text === next && s.text !== prev);
    if (reverted) {
      emit({
        type: "revert",
        payload: { original: prev, current_after_revert: next, range },
      });
      // Drop snapshots up to and including the matched one so an A → B → A → B → A sequence
      // doesn't repeat-emit revert against the very same snapshot.
      const matchedIdx = this.snapshots.indexOf(reverted);
      this.snapshots = this.snapshots.slice(matchedIdx + 1);
      return;
    }

    emit({ type: "edit", payload: { from: prev, to: next, range } });
    this.snapshots.push({ text: prev, t: now });
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
  }

  /** Test-only — observe how many snapshots are buffered. */
  snapshotCount(): number {
    return this.snapshots.length;
  }
}
