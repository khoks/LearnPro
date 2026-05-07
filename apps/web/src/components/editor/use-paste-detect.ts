"use client";

import { useCallback, useState } from "react";
import {
  buildPasteContext,
  shouldTriggerPasteModal,
  type PasteContext,
  type PasteEventLike,
} from "./paste-detect";

// STORY-042 — small hook that owns the paste-detect modal's "single occurrence per paste"
// invariant. The editor component calls `onPaste(text, currentContent)` from its onPaste handler;
// the hook decides whether to surface the modal and exposes `paste`, `dismiss`, and `gotHelp`
// handlers for the parent to forward into <PasteDetectModal>.

export interface UsePasteDetectOptions {
  // Called when the user picks "I got help". Used by the result panel to default the per-submission
  // got-help toggle to true (the user can still flip it back before submitting).
  onGotHelp?: () => void;
}

export interface UsePasteDetectReturn {
  paste: PasteContext | null;
  // Editor handler — pass to Monaco's onPaste via the paste handler in the editor parent. Records
  // a fresh PasteContext when the paste qualifies; no-op otherwise.
  notifyPaste: (input: PasteEventLike) => void;
  // Used by the parent to render the modal: `<PasteDetectModal paste={paste} onMyCode={dismiss}
  // onGotHelp={gotHelp} />`. Both clear the modal; `gotHelp` also fires the `onGotHelp` callback.
  dismiss: () => void;
  gotHelp: () => void;
}

export function usePasteDetect(opts: UsePasteDetectOptions = {}): UsePasteDetectReturn {
  const [paste, setPaste] = useState<PasteContext | null>(null);

  const notifyPaste = useCallback((input: PasteEventLike) => {
    if (!shouldTriggerPasteModal(input)) return;
    setPaste(buildPasteContext(input));
  }, []);

  const dismiss = useCallback(() => {
    setPaste(null);
  }, []);

  const gotHelp = useCallback(() => {
    setPaste(null);
    opts.onGotHelp?.();
  }, [opts]);

  return { paste, notifyPaste, dismiss, gotHelp };
}
