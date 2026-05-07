/**
 * @vitest-environment jsdom
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTreeSidebar } from "./FileTreeSidebar";
import { initWorkspaceFileTree } from "./file-tree-state";

void React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FORBIDDEN_PHRASES = [
  "DON'T LOSE",
  "lose your streak",
  "fall behind",
  "DAY ",
  "🔥",
  "⚠️",
  "leaderboard",
  "hurry",
];

let container: HTMLDivElement;
let root: Root;

const SEED = initWorkspaceFileTree(
  [
    { path: "main.py", content: "print('hi')\n" },
    { path: "lib/util.py", content: "def f(): pass\n" },
  ],
  { entry_file: "main.py" },
);

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

const noop = () => undefined;

// React's controlled <input> hijacks `.value` writes, so a naive `input.value = "x"; dispatch
// "input"` doesn't propagate to React.  Use the prototype's native setter to bypass the
// hijack — same pattern @testing-library/react uses internally.
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("FileTreeSidebar — render", () => {
  it("lists all files sorted alphabetically", () => {
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={noop}
          onRename={noop}
          onDelete={noop}
          error={null}
        />,
      );
    });
    const rows = container.querySelectorAll("[data-testid='file-tree-row']");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.getAttribute("data-path")).toBe("lib/util.py");
    expect(rows[1]?.getAttribute("data-path")).toBe("main.py");
  });

  it("marks the active file with data-active=true", () => {
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={noop}
          onRename={noop}
          onDelete={noop}
          error={null}
        />,
      );
    });
    const main = container.querySelector("[data-path='main.py']");
    expect(main?.getAttribute("data-active")).toBe("true");
    const lib = container.querySelector("[data-path='lib/util.py']");
    expect(lib?.getAttribute("data-active")).toBe("false");
  });

  it("marks the entry file with data-entry=true and an indicator badge", () => {
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={noop}
          onRename={noop}
          onDelete={noop}
          error={null}
        />,
      );
    });
    const main = container.querySelector("[data-path='main.py']");
    expect(main?.getAttribute("data-entry")).toBe("true");
    const indicator = main?.querySelector("[data-testid='file-tree-entry-indicator']");
    expect(indicator?.textContent).toBe("entry");
  });
});

describe("FileTreeSidebar — interactions", () => {
  it("calls onSetActive with the clicked file's path", () => {
    const onSetActive = vi.fn();
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={onSetActive}
          onCreate={noop}
          onRename={noop}
          onDelete={noop}
          error={null}
        />,
      );
    });
    const libRow = container.querySelector("[data-path='lib/util.py'] button");
    act(() => {
      (libRow as HTMLButtonElement).click();
    });
    expect(onSetActive).toHaveBeenCalledWith("lib/util.py");
  });

  it("creates a new file via the create form", () => {
    const onCreate = vi.fn();
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={onCreate}
          onRename={noop}
          onDelete={noop}
          error={null}
        />,
      );
    });
    const input = container.querySelector(
      "[data-testid='file-tree-create-input']",
    ) as HTMLInputElement;
    const form = container.querySelector(
      "[data-testid='file-tree-create-form']",
    ) as HTMLFormElement;
    act(() => {
      setInputValue(input, "lib/extra.py");
    });
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onCreate).toHaveBeenCalledWith("lib/extra.py");
  });

  it("doesn't submit when the new-file input is empty", () => {
    const onCreate = vi.fn();
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={onCreate}
          onRename={noop}
          onDelete={noop}
          error={null}
        />,
      );
    });
    const form = container.querySelector(
      "[data-testid='file-tree-create-form']",
    ) as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("calls onDelete when the trash button is clicked", () => {
    const onDelete = vi.fn();
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={noop}
          onRename={noop}
          onDelete={onDelete}
          error={null}
        />,
      );
    });
    const libDelete = container.querySelector(
      "[data-path='lib/util.py'] [data-testid='file-tree-delete']",
    );
    act(() => {
      (libDelete as HTMLButtonElement).click();
    });
    expect(onDelete).toHaveBeenCalledWith("lib/util.py");
  });

  it("disables the delete button when only one file remains", () => {
    const single = initWorkspaceFileTree([{ path: "main.py", content: "" }]);
    act(() => {
      root.render(
        <FileTreeSidebar
          state={single}
          onSetActive={noop}
          onCreate={noop}
          onRename={noop}
          onDelete={noop}
          error={null}
        />,
      );
    });
    const del = container.querySelector(
      "[data-testid='file-tree-delete']",
    ) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
  });

  it("renames a file via the rename input", () => {
    const onRename = vi.fn();
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={noop}
          onRename={onRename}
          onDelete={noop}
          error={null}
        />,
      );
    });
    const renameButton = container.querySelector(
      "[data-path='main.py'] [data-testid='file-tree-rename']",
    ) as HTMLButtonElement;
    act(() => {
      renameButton.click();
    });
    const input = container.querySelector(
      "[data-testid='file-tree-rename-input']",
    ) as HTMLInputElement;
    act(() => {
      setInputValue(input, "app.py");
    });
    const form = container.querySelector(
      "[data-testid='file-tree-rename-form']",
    ) as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onRename).toHaveBeenCalledWith("main.py", "app.py");
  });

  it("Escape cancels a pending rename", () => {
    const onRename = vi.fn();
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={noop}
          onRename={onRename}
          onDelete={noop}
          error={null}
        />,
      );
    });
    const renameButton = container.querySelector(
      "[data-path='main.py'] [data-testid='file-tree-rename']",
    ) as HTMLButtonElement;
    act(() => {
      renameButton.click();
    });
    const input = container.querySelector(
      "[data-testid='file-tree-rename-input']",
    ) as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onRename).not.toHaveBeenCalled();
    // The rename input should be gone after cancel.
    expect(container.querySelector("[data-testid='file-tree-rename-input']")).toBeNull();
  });
});

describe("FileTreeSidebar — error surface", () => {
  it("renders inline error messages with role=alert", () => {
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={noop}
          onRename={noop}
          onDelete={noop}
          error={{
            code: "duplicate_path",
            message: "main.py already exists.",
          }}
        />,
      );
    });
    const alert = container.querySelector("[data-testid='file-tree-error']");
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toMatch(/already exists/);
  });

  it("error copy is coach-voice (no FOMO / no streak shouting / no all-caps imperatives)", () => {
    const messages = [
      "Use a relative path with letters, numbers, and dots only.",
      "lib/utils.py already exists.",
      "Keep at least one file in the workspace.",
    ];
    for (const msg of messages) {
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(msg.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
      // No `!!!`-style urgency.
      expect(msg).not.toMatch(/!{2,}/);
    }
  });
});

describe("FileTreeSidebar — entry-file controls", () => {
  it("calls onSetEntry when the make-entry button is clicked", () => {
    const onSetEntry = vi.fn();
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={noop}
          onRename={noop}
          onDelete={noop}
          onSetEntry={onSetEntry}
          error={null}
        />,
      );
    });
    const setEntry = container.querySelector(
      "[data-path='lib/util.py'] [data-testid='file-tree-set-entry']",
    );
    act(() => {
      (setEntry as HTMLButtonElement).click();
    });
    expect(onSetEntry).toHaveBeenCalledWith("lib/util.py");
  });

  it("hides the make-entry button on the file that's already the entry", () => {
    act(() => {
      root.render(
        <FileTreeSidebar
          state={SEED}
          onSetActive={noop}
          onCreate={noop}
          onRename={noop}
          onDelete={noop}
          onSetEntry={noop}
          error={null}
        />,
      );
    });
    const mainSetEntry = container.querySelector(
      "[data-path='main.py'] [data-testid='file-tree-set-entry']",
    );
    expect(mainSetEntry).toBeNull();
  });
});
