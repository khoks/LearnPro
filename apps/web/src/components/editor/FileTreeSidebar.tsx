"use client";

import * as React from "react";
import { useCallback, useState } from "react";
import type {
  WorkspaceFileTreeError,
  WorkspaceFileTreeState,
} from "./file-tree-state";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the import.
void React;

// STORY-043 — File tree sidebar.  Renders the workspace as a flat list of files (we
// considered a real tree with nested <ul>; flat is faster and the typical workspace is
// shallow).  Click a row → switch active.  + creates a new file via a small inline form;
// double-click rename; trash icon delete.  Errors render inline with calm coach-voice copy.
//
// Why no drag-drop reorder: per STORY-043 Notes the v1 scope is text-only actions.

export interface FileTreeSidebarProps {
  state: WorkspaceFileTreeState;
  onSetActive: (path: string) => void;
  onCreate: (path: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (path: string) => void;
  onSetEntry?: (path: string) => void;
  // Most-recent error from the reducer, surfaced inline so the user can correct path issues.
  error: WorkspaceFileTreeError | null;
  onClearError?: () => void;
  // Optional `disabled` flag — used by SessionClient when the editor is read-only between
  // submit + finish so users can't quietly mutate the workspace mid-grade.
  disabled?: boolean;
}

export function FileTreeSidebar(props: FileTreeSidebarProps): React.ReactElement {
  const { state, onSetActive, onCreate, onRename, onDelete, onSetEntry, error, onClearError } =
    props;
  const [draftPath, setDraftPath] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const submitCreate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = draftPath.trim();
      if (trimmed.length === 0) return;
      onCreate(trimmed);
      setDraftPath("");
    },
    [draftPath, onCreate],
  );

  const startRename = useCallback((path: string) => {
    setRenamingPath(path);
    setRenameDraft(path);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingPath(null);
    setRenameDraft("");
  }, []);

  const commitRename = useCallback(
    (from: string) => {
      const to = renameDraft.trim();
      if (to.length === 0 || to === from) {
        cancelRename();
        return;
      }
      onRename(from, to);
      setRenamingPath(null);
      setRenameDraft("");
    },
    [renameDraft, onRename, cancelRename],
  );

  const sortedFiles = [...state.files].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <aside
      data-testid="file-tree-sidebar"
      aria-label="Workspace files"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        background: "#fafafa",
        border: "1px solid #ddd",
        borderRadius: 4,
        padding: "0.6rem",
        minWidth: 200,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, color: "#37474f" }}>Files</span>
        <span
          style={{ fontSize: 12, color: "#777" }}
          title="Run executes the file marked as the entry."
        >
          {state.files.length} file{state.files.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: 2,
        }}
        role="list"
      >
        {sortedFiles.map((file) => {
          const isActive = file.path === state.active_path;
          const isEntry = file.path === state.entry_file;
          const isRenaming = renamingPath === file.path;
          return (
            <li key={file.path}>
              {isRenaming ? (
                <RenameRow
                  initialValue={renameDraft}
                  onChange={setRenameDraft}
                  onCommit={() => commitRename(file.path)}
                  onCancel={cancelRename}
                />
              ) : (
                <FileRow
                  path={file.path}
                  active={isActive}
                  entry={isEntry}
                  disabled={props.disabled === true}
                  canDelete={state.files.length > 1}
                  onClick={() => onSetActive(file.path)}
                  onRename={() => startRename(file.path)}
                  onDelete={() => onDelete(file.path)}
                  onMakeEntry={onSetEntry ? () => onSetEntry(file.path) : undefined}
                />
              )}
            </li>
          );
        })}
      </ul>

      {error ? (
        <div
          role="alert"
          data-testid="file-tree-error"
          style={{
            padding: "0.4rem 0.5rem",
            background: "#fff8e1",
            border: "1px solid #ffd54f",
            borderRadius: 4,
            color: "#5d4037",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>{error.message}</span>
          {onClearError ? (
            <button
              type="button"
              onClick={onClearError}
              style={{
                background: "transparent",
                border: "none",
                color: "#5d4037",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
              }}
              aria-label="Dismiss error"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={submitCreate} data-testid="file-tree-create-form">
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#666" }}>New file</span>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="text"
              value={draftPath}
              onChange={(e) => setDraftPath(e.target.value)}
              placeholder="lib/utils.py"
              disabled={props.disabled === true}
              aria-label="New file path"
              data-testid="file-tree-create-input"
              style={{
                flex: 1,
                padding: "0.3rem 0.4rem",
                fontSize: 12,
                border: "1px solid #ccc",
                borderRadius: 3,
                fontFamily: "monospace",
              }}
            />
            <button
              type="submit"
              disabled={props.disabled === true || draftPath.trim().length === 0}
              data-testid="file-tree-create-button"
              style={{
                padding: "0.3rem 0.6rem",
                background: draftPath.trim().length === 0 ? "#ccc" : "#0a7",
                color: "white",
                border: "none",
                borderRadius: 3,
                fontSize: 12,
                fontWeight: 600,
                cursor: draftPath.trim().length === 0 ? "not-allowed" : "pointer",
              }}
            >
              +
            </button>
          </div>
        </label>
      </form>
    </aside>
  );
}

interface FileRowProps {
  path: string;
  active: boolean;
  entry: boolean;
  disabled: boolean;
  canDelete: boolean;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMakeEntry?: () => void;
}

function FileRow(props: FileRowProps): React.ReactElement {
  const {
    path,
    active,
    entry,
    disabled,
    canDelete,
    onClick,
    onRename,
    onDelete,
    onMakeEntry,
  } = props;
  return (
    <div
      data-testid="file-tree-row"
      data-path={path}
      data-active={active ? "true" : "false"}
      data-entry={entry ? "true" : "false"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0.25rem 0.4rem",
        background: active ? "#e3f2fd" : "transparent",
        borderRadius: 3,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={() => !disabled && onRename()}
        disabled={disabled}
        title={entry ? `${path} (entry)` : path}
        style={{
          flex: 1,
          textAlign: "left",
          background: "transparent",
          border: "none",
          padding: 0,
          color: active ? "#0d47a1" : "#37474f",
          fontFamily: "monospace",
          fontSize: 12,
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: active ? 600 : 400,
        }}
      >
        {path}
        {entry ? (
          <span
            data-testid="file-tree-entry-indicator"
            style={{
              marginLeft: 6,
              fontSize: 10,
              color: "#0a7",
              fontWeight: 600,
              background: "#e8f5e9",
              padding: "0 4px",
              borderRadius: 2,
            }}
          >
            entry
          </span>
        ) : null}
      </button>

      {onMakeEntry && !entry && !disabled ? (
        <button
          type="button"
          onClick={onMakeEntry}
          title="Mark as entry file (Run executes this one)"
          aria-label={`Set ${path} as entry`}
          data-testid="file-tree-set-entry"
          style={{
            background: "transparent",
            border: "none",
            color: "#777",
            cursor: "pointer",
            fontSize: 12,
            padding: "0 4px",
          }}
        >
          ⌂
        </button>
      ) : null}

      <button
        type="button"
        onClick={onRename}
        disabled={disabled}
        title="Rename"
        aria-label={`Rename ${path}`}
        data-testid="file-tree-rename"
        style={{
          background: "transparent",
          border: "none",
          color: "#777",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 12,
          padding: "0 4px",
        }}
      >
        ✎
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled || !canDelete}
        title={canDelete ? "Delete file" : "Keep at least one file"}
        aria-label={`Delete ${path}`}
        data-testid="file-tree-delete"
        style={{
          background: "transparent",
          border: "none",
          color: canDelete && !disabled ? "#c62828" : "#aaa",
          cursor: canDelete && !disabled ? "pointer" : "not-allowed",
          fontSize: 12,
          padding: "0 4px",
        }}
      >
        ×
      </button>
    </div>
  );
}

interface RenameRowProps {
  initialValue: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function RenameRow(props: RenameRowProps): React.ReactElement {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onCommit();
      }}
      data-testid="file-tree-rename-form"
      style={{ display: "flex", gap: 4, padding: "0.25rem 0.4rem" }}
    >
      <input
        type="text"
        value={props.initialValue}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onCommit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            props.onCancel();
          }
        }}
        autoFocus
        aria-label="New name"
        data-testid="file-tree-rename-input"
        style={{
          flex: 1,
          padding: "0.2rem 0.4rem",
          fontSize: 12,
          fontFamily: "monospace",
          border: "1px solid #1976d2",
          borderRadius: 3,
        }}
      />
    </form>
  );
}
