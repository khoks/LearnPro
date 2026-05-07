/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasteDetectModal } from "./PasteDetectModal";
import { buildPasteContext } from "./paste-detect";

void React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FORBIDDEN_PHRASES = [
  "DON'T LOSE",
  "lose your streak",
  "fall behind",
  "DAY ",
  "🔥",
  "⚠️",
  "cheat",
  "cheating",
  "caught",
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("PasteDetectModal", () => {
  it("renders nothing when paste is null", () => {
    act(() => {
      root.render(
        <PasteDetectModal paste={null} onMyCode={() => undefined} onGotHelp={() => undefined} />,
      );
    });
    expect(container.querySelector('[data-testid="paste-detect-modal"]')).toBeNull();
  });

  it("renders the modal with paste preview when paste context is set", () => {
    const ctx = buildPasteContext({ text: "hello world\nfoo bar", current_content: "" });
    act(() => {
      root.render(
        <PasteDetectModal paste={ctx} onMyCode={() => undefined} onGotHelp={() => undefined} />,
      );
    });
    const modal = container.querySelector('[data-testid="paste-detect-modal"]');
    expect(modal).toBeTruthy();
    const preview = container.querySelector('[data-testid="paste-detect-modal-preview"]');
    expect(preview?.textContent).toContain("hello world");
    expect(preview?.textContent).toContain("foo bar");
  });

  it("clicking 'My code' fires the onMyCode callback", () => {
    const onMyCode = vi.fn();
    const onGotHelp = vi.fn();
    const ctx = buildPasteContext({ text: "x".repeat(50), current_content: "" });
    act(() => {
      root.render(<PasteDetectModal paste={ctx} onMyCode={onMyCode} onGotHelp={onGotHelp} />);
    });
    const btn = container.querySelector(
      '[data-testid="paste-detect-modal-my-code"]',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    act(() => {
      btn.click();
    });
    expect(onMyCode).toHaveBeenCalledTimes(1);
    expect(onGotHelp).not.toHaveBeenCalled();
  });

  it("clicking 'I got help' fires the onGotHelp callback", () => {
    const onMyCode = vi.fn();
    const onGotHelp = vi.fn();
    const ctx = buildPasteContext({ text: "x".repeat(50), current_content: "" });
    act(() => {
      root.render(<PasteDetectModal paste={ctx} onMyCode={onMyCode} onGotHelp={onGotHelp} />);
    });
    const btn = container.querySelector(
      '[data-testid="paste-detect-modal-got-help"]',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    act(() => {
      btn.click();
    });
    expect(onGotHelp).toHaveBeenCalledTimes(1);
    expect(onMyCode).not.toHaveBeenCalled();
  });

  it("ESC dismisses (calls onMyCode by default — no penalty)", () => {
    const onMyCode = vi.fn();
    const ctx = buildPasteContext({ text: "x".repeat(50), current_content: "" });
    act(() => {
      root.render(<PasteDetectModal paste={ctx} onMyCode={onMyCode} onGotHelp={() => undefined} />);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onMyCode).toHaveBeenCalledTimes(1);
  });

  it("does not respond to ESC when paste is null (listener removed)", () => {
    const onMyCode = vi.fn();
    act(() => {
      root.render(
        <PasteDetectModal paste={null} onMyCode={onMyCode} onGotHelp={() => undefined} />,
      );
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onMyCode).not.toHaveBeenCalled();
  });

  it("uses role=dialog and aria-modal for SR users", () => {
    const ctx = buildPasteContext({ text: "x".repeat(50), current_content: "" });
    act(() => {
      root.render(
        <PasteDetectModal paste={ctx} onMyCode={() => undefined} onGotHelp={() => undefined} />,
      );
    });
    const modal = container.querySelector('[data-testid="paste-detect-modal"]') as HTMLElement;
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("true");
    expect(modal.getAttribute("aria-labelledby")).toBe("paste-detect-modal-headline");
  });

  it("never declares dark-pattern / accusatory copy in its source", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(process.cwd(), "src/components/editor/PasteDetectModal.tsx");
    const source = fs.readFileSync(file, "utf8");
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(source, `forbidden phrase ${phrase}`).not.toContain(phrase);
    }
  });

  it("renders coach-voice copy under SSR", () => {
    const ctx = buildPasteContext({ text: "x".repeat(50), current_content: "" });
    const html = renderToStaticMarkup(
      <PasteDetectModal paste={ctx} onMyCode={() => undefined} onGotHelp={() => undefined} />,
    );
    expect(html).toContain("Looks like you pasted some code");
    expect(html).toContain("got help");
    expect(html).toContain("My code");
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(html, `forbidden phrase ${phrase}`).not.toContain(phrase);
    }
  });
});
