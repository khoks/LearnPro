"use client";

// STORY-042 — wire Monaco's `onDidPaste` event into a plain text callback. The editor passes a
// `range` (line/col bounds of where the paste landed); we resolve the actual pasted text from
// `editor.getModel().getValueInRange(range)`. A DOM-event fallback covers the (rare) path where
// Monaco hasn't bound the IME yet on first focus.

interface PasteRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface MonacoEditorWithPaste {
  onDidPaste?: (cb: (e: { range: PasteRange }) => unknown) => unknown;
  getModel?: () => { getValueInRange?: (r: PasteRange) => string } | null;
  getDomNode?: () => HTMLElement | null;
}

export function attachPasteListener(editor: unknown, onPaste: (text: string) => void): void {
  if (!editor || typeof editor !== "object") return;
  const ed = editor as MonacoEditorWithPaste;
  if (typeof ed.onDidPaste === "function") {
    ed.onDidPaste((e) => {
      const model = ed.getModel?.();
      if (!model || typeof model.getValueInRange !== "function") return;
      const text = model.getValueInRange(e.range);
      if (typeof text === "string" && text.length > 0) onPaste(text);
    });
  }
  const dom = ed.getDomNode?.();
  if (dom && typeof dom.addEventListener === "function") {
    dom.addEventListener("paste", (ev: Event) => {
      const ce = ev as ClipboardEvent;
      const text = ce.clipboardData?.getData?.("text") ?? "";
      if (text.length > 0) onPaste(text);
    });
  }
}
