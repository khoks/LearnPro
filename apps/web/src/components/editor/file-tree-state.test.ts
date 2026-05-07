import { describe, expect, it } from "vitest";
import {
  initWorkspaceFileTree,
  isValidWorkspacePath,
  toSandboxFiles,
  workspaceFileTreeReducer,
  type WorkspaceFileTreeState,
} from "./file-tree-state";

const SEED: WorkspaceFileTreeState = initWorkspaceFileTree(
  [
    { path: "main.py", content: "print('hi')\n" },
    { path: "lib/util.py", content: "def f(): pass\n" },
  ],
  { entry_file: "main.py" },
);

describe("isValidWorkspacePath", () => {
  it("accepts simple relative paths", () => {
    expect(isValidWorkspacePath("main.py")).toBe(true);
    expect(isValidWorkspacePath("lib/util.py")).toBe(true);
    expect(isValidWorkspacePath("a/b/c.ts")).toBe(true);
  });

  it("rejects empty / overlong paths", () => {
    expect(isValidWorkspacePath("")).toBe(false);
    expect(isValidWorkspacePath("a".repeat(257))).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(isValidWorkspacePath("../etc/passwd")).toBe(false);
    expect(isValidWorkspacePath("a/../b")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isValidWorkspacePath("/etc/passwd")).toBe(false);
  });

  it("rejects spaces and other unsafe chars", () => {
    expect(isValidWorkspacePath("foo bar.py")).toBe(false);
    expect(isValidWorkspacePath("foo;rm.py")).toBe(false);
  });
});

describe("initWorkspaceFileTree", () => {
  it("seeds active_path and entry_file from options", () => {
    const s = initWorkspaceFileTree(
      [
        { path: "a.py", content: "" },
        { path: "main.py", content: "" },
      ],
      { active_path: "main.py", entry_file: "main.py" },
    );
    expect(s.active_path).toBe("main.py");
    expect(s.entry_file).toBe("main.py");
  });

  it("falls back to the first file when options are absent or invalid", () => {
    const s = initWorkspaceFileTree([
      { path: "a.py", content: "" },
      { path: "b.py", content: "" },
    ]);
    expect(s.active_path).toBe("a.py");
    expect(s.entry_file).toBe("a.py");
  });

  it("rejects empty seed list", () => {
    expect(() => initWorkspaceFileTree([])).toThrow();
  });

  it("rejects duplicate paths in seed list", () => {
    expect(() =>
      initWorkspaceFileTree([
        { path: "a.py", content: "1" },
        { path: "a.py", content: "2" },
      ]),
    ).toThrow();
  });

  it("rejects invalid seed paths", () => {
    expect(() => initWorkspaceFileTree([{ path: "../x.py", content: "" }])).toThrow();
  });
});

describe("workspaceFileTreeReducer — create", () => {
  it("appends a new file and switches the active pointer to it", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "create",
      path: "lib/extra.py",
    });
    expect(error).toBeNull();
    expect(state.files.map((f) => f.path)).toEqual(["main.py", "lib/util.py", "lib/extra.py"]);
    expect(state.active_path).toBe("lib/extra.py");
  });

  it("rejects invalid paths with a friendly message", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "create",
      path: "../bad.py",
    });
    expect(error?.code).toBe("invalid_path");
    expect(error?.message).toMatch(/relative path/);
    expect(state.files.length).toBe(SEED.files.length);
  });

  it("rejects duplicates", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "create",
      path: "main.py",
    });
    expect(error?.code).toBe("duplicate_path");
    expect(state.files.length).toBe(SEED.files.length);
  });

  it("does not bias toward FOMO-y or coercive copy in the error message", () => {
    const { error } = workspaceFileTreeReducer(SEED, {
      type: "create",
      path: "bad path.py",
    });
    expect(error?.message).not.toMatch(/DON'T LOSE|don't lose|hurry|act now/i);
    expect(error?.message).not.toMatch(/!{2,}/);
  });
});

describe("workspaceFileTreeReducer — rename", () => {
  it("renames a file and follows the active pointer", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "rename",
      from: "main.py",
      to: "app.py",
    });
    expect(error).toBeNull();
    expect(state.files.map((f) => f.path)).toEqual(["app.py", "lib/util.py"]);
    expect(state.active_path).toBe("app.py");
    expect(state.entry_file).toBe("app.py");
  });

  it("is a no-op when from === to", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "rename",
      from: "main.py",
      to: "main.py",
    });
    expect(error).toBeNull();
    expect(state).toBe(SEED);
  });

  it("rejects renaming into an existing path", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "rename",
      from: "main.py",
      to: "lib/util.py",
    });
    expect(error?.code).toBe("duplicate_path");
    expect(state.files).toEqual(SEED.files);
  });

  it("rejects renaming a missing file", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "rename",
      from: "ghost.py",
      to: "x.py",
    });
    expect(error?.code).toBe("missing_path");
    expect(state).toBe(SEED);
  });
});

describe("workspaceFileTreeReducer — delete", () => {
  it("removes the file and re-points active to a sibling", () => {
    const { state, error } = workspaceFileTreeReducer(
      { ...SEED, active_path: "lib/util.py" },
      { type: "delete", path: "lib/util.py" },
    );
    expect(error).toBeNull();
    expect(state.files.map((f) => f.path)).toEqual(["main.py"]);
    expect(state.active_path).toBe("main.py");
  });

  it("re-points entry_file when the deleted file was the entry", () => {
    const seed = initWorkspaceFileTree(
      [
        { path: "main.py", content: "" },
        { path: "alt.py", content: "" },
      ],
      { entry_file: "main.py" },
    );
    const { state, error } = workspaceFileTreeReducer(seed, {
      type: "delete",
      path: "main.py",
    });
    expect(error).toBeNull();
    expect(state.entry_file).toBe("alt.py");
  });

  it("refuses to delete the last remaining file", () => {
    const onlyOne = initWorkspaceFileTree([{ path: "main.py", content: "" }]);
    const { state, error } = workspaceFileTreeReducer(onlyOne, {
      type: "delete",
      path: "main.py",
    });
    expect(error?.code).toBe("cannot_delete_last_file");
    expect(state).toBe(onlyOne);
  });
});

describe("workspaceFileTreeReducer — set_active / set_content / set_entry", () => {
  it("set_active swaps the editor focus", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "set_active",
      path: "lib/util.py",
    });
    expect(error).toBeNull();
    expect(state.active_path).toBe("lib/util.py");
  });

  it("set_content updates only the named file", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "set_content",
      path: "lib/util.py",
      content: "def f(): return 42\n",
    });
    expect(error).toBeNull();
    const file = state.files.find((f) => f.path === "lib/util.py");
    expect(file?.content).toBe("def f(): return 42\n");
  });

  it("set_entry pins a different entry file", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "set_entry",
      path: "lib/util.py",
    });
    expect(error).toBeNull();
    expect(state.entry_file).toBe("lib/util.py");
  });

  it("rejects set_active / set_content / set_entry on missing files", () => {
    expect(
      workspaceFileTreeReducer(SEED, { type: "set_active", path: "ghost" }).error?.code,
    ).toBe("missing_path");
    expect(
      workspaceFileTreeReducer(SEED, { type: "set_content", path: "ghost", content: "" })
        .error?.code,
    ).toBe("missing_path");
    expect(
      workspaceFileTreeReducer(SEED, { type: "set_entry", path: "ghost" }).error?.code,
    ).toBe("missing_path");
  });
});

describe("workspaceFileTreeReducer — replace", () => {
  it("replaces the whole workspace with a fresh seed", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "replace",
      files: [{ path: "index.ts", content: "console.log('hi')\n" }],
      entry_file: "index.ts",
    });
    expect(error).toBeNull();
    expect(state.files).toEqual([{ path: "index.ts", content: "console.log('hi')\n" }]);
    expect(state.entry_file).toBe("index.ts");
    expect(state.active_path).toBe("index.ts");
  });

  it("returns an error when the replacement seed is invalid", () => {
    const { state, error } = workspaceFileTreeReducer(SEED, {
      type: "replace",
      files: [],
    });
    expect(error?.code).toBe("invalid_path");
    expect(state).toBe(SEED);
  });
});

describe("toSandboxFiles", () => {
  it("converts the state into the sandbox's request shape", () => {
    const out = toSandboxFiles(SEED);
    expect(out.entry_file).toBe("main.py");
    expect(out.files).toEqual([
      { path: "main.py", content: "print('hi')\n" },
      { path: "lib/util.py", content: "def f(): pass\n" },
    ]);
  });
});
