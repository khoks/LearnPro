/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import { usePasteDetect } from "./use-paste-detect";

void React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal "renderHook"-equivalent — apps/web doesn't pull @testing-library, so we render a tiny
// component that calls the hook and exposes its return into a closure.
function renderUsePasteDetect(args: { onGotHelp?: () => void } = {}) {
  let captured!: ReturnType<typeof usePasteDetect>;

  function Probe() {
    captured = usePasteDetect(args);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });

  return {
    get current() {
      return captured;
    },
    rerender: () => {
      act(() => {
        root.render(<Probe />);
      });
    },
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("usePasteDetect", () => {
  it("starts with paste === null", () => {
    const h = renderUsePasteDetect();
    expect(h.current.paste).toBeNull();
    h.cleanup();
  });

  it("notifyPaste with a long paste sets the modal context", () => {
    const h = renderUsePasteDetect();
    act(() => {
      h.current.notifyPaste({ text: "x".repeat(50), current_content: "" });
    });
    h.rerender();
    expect(h.current.paste).not.toBeNull();
    expect(h.current.paste?.paste_length).toBe(50);
    h.cleanup();
  });

  it("notifyPaste with a tiny paste does NOT trigger the modal", () => {
    const h = renderUsePasteDetect();
    act(() => {
      h.current.notifyPaste({ text: "abc", current_content: "x".repeat(100) });
    });
    h.rerender();
    expect(h.current.paste).toBeNull();
    h.cleanup();
  });

  it("dismiss clears the modal context", () => {
    const h = renderUsePasteDetect();
    act(() => {
      h.current.notifyPaste({ text: "x".repeat(50), current_content: "" });
    });
    h.rerender();
    expect(h.current.paste).not.toBeNull();
    act(() => {
      h.current.dismiss();
    });
    h.rerender();
    expect(h.current.paste).toBeNull();
    h.cleanup();
  });

  it("gotHelp clears the modal AND fires the onGotHelp callback", () => {
    const onGotHelp = vi.fn();
    const h = renderUsePasteDetect({ onGotHelp });
    act(() => {
      h.current.notifyPaste({ text: "x".repeat(50), current_content: "" });
    });
    h.rerender();
    act(() => {
      h.current.gotHelp();
    });
    h.rerender();
    expect(h.current.paste).toBeNull();
    expect(onGotHelp).toHaveBeenCalledTimes(1);
    h.cleanup();
  });

  it("after dismiss, a NEW paste opens the modal again (single-fire-per-paste enforced)", () => {
    const h = renderUsePasteDetect();
    act(() => {
      h.current.notifyPaste({ text: "x".repeat(50), current_content: "" });
    });
    h.rerender();
    expect(h.current.paste).not.toBeNull();
    act(() => {
      h.current.dismiss();
    });
    h.rerender();
    expect(h.current.paste).toBeNull();
    act(() => {
      h.current.notifyPaste({ text: "y".repeat(50), current_content: "" });
    });
    h.rerender();
    expect(h.current.paste).not.toBeNull();
    expect(h.current.paste?.text).toContain("y");
    h.cleanup();
  });
});
