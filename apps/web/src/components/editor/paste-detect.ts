// STORY-042 — pure helpers + types for the paste-detect modal. Kept side-effect-free so the
// trigger predicate is easy to unit-test, and so React component tests can build a deterministic
// `PasteContext` without a real Monaco editor.
//
// Trigger rule (from STORY-042 AC #1):
//   Pasted content is "substantial" when its length is > 20 chars OR > 30% of the editor's current
//   content. Either condition fires the modal.
//
// "Single occurrence per paste" is enforced at the component layer — this helper is purely the
// boolean trigger.

export const PASTE_LENGTH_THRESHOLD = 20;
export const PASTE_RATIO_THRESHOLD = 0.3;

export interface PasteEventLike {
  text: string;
  // The editor content at the moment of the paste (before the paste is applied). The ratio rule
  // measures the pasted text against this baseline; a paste into an empty editor always trips
  // the length rule, never the ratio rule (avoids divide-by-zero).
  current_content: string;
}

export interface PasteContext extends PasteEventLike {
  // The visible paste preview shown in the modal — the first ~200 chars, no trailing whitespace.
  preview: string;
  // Length of the original pasted text in chars.
  paste_length: number;
  // Pasted-text length / current-content length, in [0, +∞). 0 when the editor is empty. Capped
  // at +∞ so the modal copy can always read this safely.
  paste_ratio: number;
}

export function shouldTriggerPasteModal(ev: PasteEventLike): boolean {
  if (ev.text.length === 0) return false;
  if (ev.text.length > PASTE_LENGTH_THRESHOLD) return true;
  if (ev.current_content.length === 0) {
    // Pasting into an empty editor: treat as "small enough to be your own typing" unless it also
    // crossed the absolute-length threshold (handled above).
    return false;
  }
  const ratio = ev.text.length / ev.current_content.length;
  return ratio > PASTE_RATIO_THRESHOLD;
}

export function buildPasteContext(ev: PasteEventLike): PasteContext {
  const ratio = ev.current_content.length === 0 ? 0 : ev.text.length / ev.current_content.length;
  const preview = ev.text.slice(0, 200).trimEnd();
  return {
    text: ev.text,
    current_content: ev.current_content,
    preview,
    paste_length: ev.text.length,
    paste_ratio: ratio,
  };
}
