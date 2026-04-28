"use client";

import type { InteractionEvent } from "@learnpro/shared";
import { useEffect, useMemo, useRef } from "react";
import { InteractionBatcher } from "./interaction-batcher";
import { CursorFocusTracker, RevertDetector, type InteractionRange } from "./interaction-capture";

// Structural duck-type over `monaco.editor.IStandaloneCodeEditor` — keeps this hook decoupled
// from the Monaco API surface so we can unit-test it (and swap editors later) without dragging
// the full monaco-editor type graph into every consumer.
export interface MonacoLikeEditor {
  getValue(): string;
  onDidChangeCursorPosition(
    cb: (e: { position: { lineNumber: number; column: number } }) => void,
  ): MonacoDisposable;
  onDidChangeModelContent(
    cb: (e: {
      changes: ReadonlyArray<{
        range: {
          startLineNumber: number;
          startColumn: number;
          endLineNumber: number;
          endColumn: number;
        };
      }>;
    }) => void,
  ): MonacoDisposable;
}

export interface MonacoDisposable {
  dispose(): void;
}

export interface UseInteractionCaptureOptions {
  /** Override the batcher (mostly for tests / Storybook). Defaults to a fresh per-mount instance. */
  batcher?: InteractionBatcher;
  /** Min cursor-dwell ms before emitting a `cursor_focus` event. */
  cursorMinDurationMs?: number;
  /** Sliding revert window. Edits that bounce inside this window emit `revert` instead of `edit`. */
  revertWindowMs?: number;
}

export interface InteractionCaptureHandle {
  /** Hand the live Monaco editor instance to the hook. Wire from the `<Editor onMount={...}>`. */
  attach(editor: MonacoLikeEditor): void;
  /** Emit an event manually (e.g. from a Run / Submit / hint button). */
  emit(event: InteractionEvent): void;
  /** Force the current buffer to flush — useful before navigating away. */
  flush(): Promise<void>;
}

// React glue. Subscribes Monaco's cursor + content events, runs them through pure trackers
// (`CursorFocusTracker`, `RevertDetector`), and pipes the resulting `InteractionEvent`s into
// a per-mount `InteractionBatcher`. On unmount: dispose listeners, flush remaining events.
export function useInteractionCapture(
  opts: UseInteractionCaptureOptions = {},
): InteractionCaptureHandle {
  const batcherRef = useRef<InteractionBatcher | null>(null);
  const cursorRef = useRef<CursorFocusTracker | null>(null);
  const revertRef = useRef<RevertDetector | null>(null);
  const lastTextRef = useRef<string>("");
  const disposablesRef = useRef<MonacoDisposable[]>([]);
  const ownsBatcherRef = useRef<boolean>(false);

  // Lazily build (so SSR doesn't trip over `setTimeout` etc).
  if (batcherRef.current === null) {
    if (opts.batcher) {
      batcherRef.current = opts.batcher;
      ownsBatcherRef.current = false;
    } else {
      batcherRef.current = new InteractionBatcher();
      ownsBatcherRef.current = true;
    }
  }
  if (cursorRef.current === null) {
    cursorRef.current = new CursorFocusTracker(opts.cursorMinDurationMs ?? 200);
  }
  if (revertRef.current === null) {
    revertRef.current = new RevertDetector(opts.revertWindowMs ?? 30_000);
  }

  useEffect(() => {
    return () => {
      const cursor = cursorRef.current;
      const batcher = batcherRef.current;
      if (cursor && batcher) {
        cursor.flush(now(), (e) => batcher.enqueue(e));
      }
      for (const d of disposablesRef.current) {
        try {
          d.dispose();
        } catch {
          // monaco's disposables are noisy on unmount in edge cases; safe to ignore
        }
      }
      disposablesRef.current = [];
      if (batcher) {
        void batcher.flush();
        if (ownsBatcherRef.current) batcher.destroy();
      }
    };
  }, []);

  return useMemo<InteractionCaptureHandle>(
    () => ({
      attach(editor: MonacoLikeEditor): void {
        const batcher = batcherRef.current!;
        const cursor = cursorRef.current!;
        const revert = revertRef.current!;
        lastTextRef.current = editor.getValue();

        const cursorSub = editor.onDidChangeCursorPosition((e) => {
          const line = e.position.lineNumber;
          cursor.onCursorChange({ line_start: line, line_end: line }, now(), (ev) =>
            batcher.enqueue(ev),
          );
        });

        const editSub = editor.onDidChangeModelContent((e) => {
          const next = editor.getValue();
          const prev = lastTextRef.current;
          lastTextRef.current = next;
          const range = firstChangeRange(e.changes) ?? {
            start_line: 0,
            start_col: 0,
            end_line: 0,
            end_col: 0,
          };
          revert.onEdit(prev, next, range, now(), (ev) => batcher.enqueue(ev));
        });

        disposablesRef.current.push(cursorSub, editSub);
      },
      emit(event: InteractionEvent): void {
        batcherRef.current?.enqueue(event);
      },
      flush(): Promise<void> {
        return batcherRef.current?.flush() ?? Promise.resolve();
      },
    }),
    [],
  );
}

function firstChangeRange(
  changes: ReadonlyArray<{
    range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    };
  }>,
): InteractionRange | null {
  const c = changes[0];
  if (!c) return null;
  return {
    start_line: c.range.startLineNumber,
    start_col: c.range.startColumn,
    end_line: c.range.endLineNumber,
    end_col: c.range.endColumn,
  };
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
