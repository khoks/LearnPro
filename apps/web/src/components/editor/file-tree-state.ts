// STORY-043 — pure file-tree state for the multi-file workspace editor.
//
// Why split this out: the React component is thin; the *rules* (reject duplicates / reject
// path traversal / sort by path / pick a sensible "next active file" on delete) live here so
// they're unit-testable without RTL.  Same pattern as @learnpro/scoring: pure logic in one
// module, view in another.
//
// Path validation matches the sandbox's `SandboxWorkspaceFileSchema` regex so a workspace
// drafted in the editor can be shipped to the sandbox without a separate validation pass.

const WORKSPACE_PATH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]+$/;

export interface WorkspaceFileTreeState {
  // Insertion order is preserved so authors who scaffold a workspace see it laid out the way
  // they expect (entry file first if it was authored that way, etc.).
  files: ReadonlyArray<WorkspaceFile>;
  active_path: string;
  // STORY-043 — entry_file pins which file "main" runs.  Defaults to the first file added
  // if not explicitly set.  Used by Run/Submit to tell the sandbox which file is `main`.
  entry_file: string;
}

export interface WorkspaceFile {
  path: string;
  content: string;
}

export type WorkspaceFileTreeAction =
  | { type: "create"; path: string; content?: string }
  | { type: "rename"; from: string; to: string }
  | { type: "delete"; path: string }
  | { type: "set_active"; path: string }
  | { type: "set_content"; path: string; content: string }
  | { type: "set_entry"; path: string }
  // STORY-043 — replace the entire workspace.  Used by the playground on language switch
  // (Python ↔ TypeScript) and by SessionClient when a new problem assigns its starter
  // workspace.  Validation matches `initWorkspaceFileTree`'s rules.
  | {
      type: "replace";
      files: ReadonlyArray<WorkspaceFile>;
      active_path?: string;
      entry_file?: string;
    };

export type WorkspaceFileTreeError =
  | { code: "invalid_path"; message: string }
  | { code: "duplicate_path"; message: string }
  | { code: "missing_path"; message: string }
  | { code: "cannot_delete_last_file"; message: string };

export interface WorkspaceFileTreeReducerResult {
  state: WorkspaceFileTreeState;
  error: WorkspaceFileTreeError | null;
}

export function isValidWorkspacePath(p: string): boolean {
  return p.length > 0 && p.length <= 256 && WORKSPACE_PATH.test(p);
}

export function initWorkspaceFileTree(
  files: ReadonlyArray<WorkspaceFile>,
  options: { active_path?: string; entry_file?: string } = {},
): WorkspaceFileTreeState {
  if (files.length === 0) {
    throw new Error("workspace must start with at least one file");
  }
  const seen = new Set<string>();
  for (const f of files) {
    if (!isValidWorkspacePath(f.path)) {
      throw new Error(`invalid workspace path: ${f.path}`);
    }
    if (seen.has(f.path)) throw new Error(`duplicate path: ${f.path}`);
    seen.add(f.path);
  }
  const initialActive =
    options.active_path && seen.has(options.active_path) ? options.active_path : files[0]!.path;
  const initialEntry =
    options.entry_file && seen.has(options.entry_file) ? options.entry_file : files[0]!.path;
  return {
    files: files.map((f) => ({ path: f.path, content: f.content })),
    active_path: initialActive,
    entry_file: initialEntry,
  };
}

export function workspaceFileTreeReducer(
  state: WorkspaceFileTreeState,
  action: WorkspaceFileTreeAction,
): WorkspaceFileTreeReducerResult {
  switch (action.type) {
    case "create":
      return create(state, action.path, action.content ?? "");
    case "rename":
      return rename(state, action.from, action.to);
    case "delete":
      return remove(state, action.path);
    case "set_active": {
      if (!state.files.some((f) => f.path === action.path)) {
        return { state, error: { code: "missing_path", message: `no such file: ${action.path}` } };
      }
      return { state: { ...state, active_path: action.path }, error: null };
    }
    case "set_content": {
      if (!state.files.some((f) => f.path === action.path)) {
        return { state, error: { code: "missing_path", message: `no such file: ${action.path}` } };
      }
      const next = state.files.map((f) =>
        f.path === action.path ? { path: f.path, content: action.content } : f,
      );
      return { state: { ...state, files: next }, error: null };
    }
    case "set_entry": {
      if (!state.files.some((f) => f.path === action.path)) {
        return { state, error: { code: "missing_path", message: `no such file: ${action.path}` } };
      }
      return { state: { ...state, entry_file: action.path }, error: null };
    }
    case "replace": {
      try {
        const next = initWorkspaceFileTree(action.files, {
          ...(action.active_path !== undefined && { active_path: action.active_path }),
          ...(action.entry_file !== undefined && { entry_file: action.entry_file }),
        });
        return { state: next, error: null };
      } catch (err) {
        return {
          state,
          error: {
            code: "invalid_path",
            message: err instanceof Error ? err.message : "Couldn't replace workspace.",
          },
        };
      }
    }
  }
}

function create(
  state: WorkspaceFileTreeState,
  path: string,
  content: string,
): WorkspaceFileTreeReducerResult {
  if (!isValidWorkspacePath(path)) {
    return {
      state,
      error: {
        code: "invalid_path",
        message: "Use a relative path with letters, numbers, and dots only.",
      },
    };
  }
  if (state.files.some((f) => f.path === path)) {
    return {
      state,
      error: { code: "duplicate_path", message: `${path} already exists.` },
    };
  }
  const nextFiles = [...state.files, { path, content }];
  return {
    state: { ...state, files: nextFiles, active_path: path },
    error: null,
  };
}

function rename(
  state: WorkspaceFileTreeState,
  from: string,
  to: string,
): WorkspaceFileTreeReducerResult {
  if (from === to) return { state, error: null };
  if (!state.files.some((f) => f.path === from)) {
    return { state, error: { code: "missing_path", message: `no such file: ${from}` } };
  }
  if (!isValidWorkspacePath(to)) {
    return {
      state,
      error: {
        code: "invalid_path",
        message: "Use a relative path with letters, numbers, and dots only.",
      },
    };
  }
  if (state.files.some((f) => f.path === to)) {
    return {
      state,
      error: { code: "duplicate_path", message: `${to} already exists.` },
    };
  }
  const nextFiles = state.files.map((f) =>
    f.path === from ? { path: to, content: f.content } : f,
  );
  // Keep the active pointer pointed at the same logical file after a rename. Same for entry.
  const nextActive = state.active_path === from ? to : state.active_path;
  const nextEntry = state.entry_file === from ? to : state.entry_file;
  return {
    state: { ...state, files: nextFiles, active_path: nextActive, entry_file: nextEntry },
    error: null,
  };
}

function remove(state: WorkspaceFileTreeState, path: string): WorkspaceFileTreeReducerResult {
  if (state.files.length === 1) {
    return {
      state,
      error: {
        code: "cannot_delete_last_file",
        message: "Keep at least one file in the workspace.",
      },
    };
  }
  if (!state.files.some((f) => f.path === path)) {
    return { state, error: { code: "missing_path", message: `no such file: ${path}` } };
  }
  const remainingIdx = state.files.findIndex((f) => f.path === path);
  const nextFiles = state.files.filter((f) => f.path !== path);
  // Pick a sensible next-active: the file that was right before, falling back to whatever's
  // first.  Same for entry_file (it falls back to first if the entry was the deleted file).
  const nextActive =
    state.active_path === path
      ? (nextFiles[Math.max(0, remainingIdx - 1)] ?? nextFiles[0])!.path
      : state.active_path;
  const nextEntry = state.entry_file === path ? nextFiles[0]!.path : state.entry_file;
  return {
    state: { ...state, files: nextFiles, active_path: nextActive, entry_file: nextEntry },
    error: null,
  };
}

// STORY-043 — convenience to produce the array shape the sandbox expects.
export function toSandboxFiles(state: WorkspaceFileTreeState): {
  files: Array<{ path: string; content: string }>;
  entry_file: string;
} {
  return {
    files: state.files.map((f) => ({ path: f.path, content: f.content })),
    entry_file: state.entry_file,
  };
}
