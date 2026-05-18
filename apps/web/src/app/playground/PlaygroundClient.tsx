"use client";

import * as React from "react";
import { useCallback, useMemo, useReducer, useState } from "react";
import dynamic from "next/dynamic";
import type { SandboxLanguage, SandboxRunResponse } from "@learnpro/sandbox";
import { OfflineBanner } from "../../components/pwa/OfflineBanner";
import { StatusBadge } from "../../components/status-badge";
import { PasteDetectModal } from "../../components/editor/PasteDetectModal";
import { usePasteDetect } from "../../components/editor/use-paste-detect";
import { attachPasteListener } from "../../components/editor/monaco-paste";
import { FileTreeSidebar } from "../../components/editor/FileTreeSidebar";
import {
  initWorkspaceFileTree,
  toSandboxFiles,
  workspaceFileTreeReducer,
  type WorkspaceFileTreeAction,
  type WorkspaceFileTreeError,
  type WorkspaceFileTreeState,
} from "../../components/editor/file-tree-state";
import { runSandbox, type RunSandboxResult } from "../../lib/run-sandbox";
import { runSandboxStream } from "../../lib/run-sandbox-stream";
import { useInteractionCapture, type MonacoLikeEditor } from "../../lib/use-interaction-capture";
import { useViewportSize } from "../../lib/use-viewport-size";
import { statusFor } from "./status";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. Same workaround pattern as elsewhere in apps/web.
void React;

const Editor = dynamic(() => import("@monaco-editor/react").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 360,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e1e1e",
        color: "#aaa",
        fontFamily: "monospace",
      }}
    >
      Loading editor…
    </div>
  ),
});

const STARTERS: Record<SandboxLanguage, string> = {
  python: "print('hello from python')\n",
  typescript: "console.log('hello from typescript')\n",
};

// STORY-043 — per-language entry-file convention.  Mirrors `ENTRY_FILE_BY_LANGUAGE` from
// @learnpro/sandbox; duplicating the constant in the client avoids an import that would
// drag the whole sandbox bundle in.
const ENTRY_FILE: Record<SandboxLanguage, string> = {
  python: "main.py",
  typescript: "index.ts",
};

const MONACO_LANGUAGE: Record<SandboxLanguage, string> = {
  python: "python",
  typescript: "typescript",
};

export interface StreamingState {
  stdout: string[];
  stderr: string[];
}

function reduceWorkspace(
  state: WorkspaceFileTreeState,
  action: WorkspaceFileTreeAction,
): WorkspaceFileTreeState {
  return workspaceFileTreeReducer(state, action).state;
}

// STORY-043 — derive the Monaco language id from a file's extension.  Falls back to the
// session's selected language when the extension is unknown (e.g. .txt scratch files).
function languageForPath(path: string, fallback: SandboxLanguage): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return MONACO_LANGUAGE[fallback];
}

export function PlaygroundClient() {
  const [language, setLanguage] = useState<SandboxLanguage>("python");
  // STORY-043 — workspace state replaces the single `code` ref.  By default the workspace
  // contains exactly one file (per-language entry filename) so the single-file UX is
  // unchanged for the common case.  Users can add files via the FileTreeSidebar.
  const [workspace, dispatchWorkspace] = useReducer(reduceWorkspace, null, () =>
    initWorkspaceFileTree([{ path: ENTRY_FILE.python, content: STARTERS.python }], {
      entry_file: ENTRY_FILE.python,
    }),
  );
  const [workspaceError, setWorkspaceError] = useState<WorkspaceFileTreeError | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunSandboxResult | null>(null);
  const [streamOutput, setStreamOutput] = useState(false);
  const [streamState, setStreamState] = useState<StreamingState | null>(null);
  const [voiceOptIn, setVoiceOptIn] = useState(false);
  const capture = useInteractionCapture();
  const pasteDetect = usePasteDetect();
  const activeFile = workspace.files.find((f) => f.path === workspace.active_path);
  const code = activeFile?.content ?? "";
  const codeRef = React.useRef(code);
  React.useEffect(() => {
    codeRef.current = code;
  }, [code]);

  const dispatchWithError = useCallback(
    (action: WorkspaceFileTreeAction) => {
      const result = workspaceFileTreeReducer(workspace, action);
      if (result.error) {
        setWorkspaceError(result.error);
        return;
      }
      setWorkspaceError(null);
      dispatchWorkspace(action);
    },
    [workspace],
  );

  const onLanguageChange = useCallback((next: SandboxLanguage) => {
    setLanguage(next);
    setResult(null);
    setStreamState(null);
    setWorkspaceError(null);
    // STORY-043 — flip the workspace to a fresh single-file scaffold for the new language so
    // the user doesn't end up with a `main.py` open while running TypeScript.
    dispatchWorkspace({
      type: "replace",
      files: [{ path: ENTRY_FILE[next], content: STARTERS[next] }],
      entry_file: ENTRY_FILE[next],
    });
  }, []);

  const onCodeChange = useCallback(
    (next: string) => {
      dispatchWorkspace({
        type: "set_content",
        path: workspace.active_path,
        content: next,
      });
    },
    [workspace.active_path],
  );

  const onEditorMount = useCallback(
    (editor: unknown) => {
      // Monaco's `IStandaloneCodeEditor` matches our structural `MonacoLikeEditor` shape.
      capture.attach(editor as MonacoLikeEditor);
      attachPasteListener(editor, (text) => {
        pasteDetect.notifyPaste({ text, current_content: codeRef.current });
      });
    },
    [capture, pasteDetect],
  );

  const onRun = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setStreamState(null);
    // STORY-043 — Run always ships the full workspace.  Single-file workspaces (the default)
    // get materialized as `[{ path: main.py | index.ts, content: <code> }]`, which the
    // sandbox accepts directly.
    const sb = toSandboxFiles(workspace);
    if (streamOutput) {
      const live: StreamingState = { stdout: [], stderr: [] };
      setStreamState({ ...live });
      let finalResult: RunSandboxResult | null = null;
      for await (const ev of runSandboxStream({
        language,
        files: sb.files,
        entry_file: sb.entry_file,
      })) {
        if (!ev.ok) {
          finalResult = {
            ok: false,
            status: 0,
            error: ev.error,
            ...(ev.message !== undefined && { message: ev.message }),
          };
          break;
        }
        const chunk = ev.chunk;
        if (chunk.type === "stdout") {
          live.stdout.push(chunk.line);
          setStreamState({ stdout: [...live.stdout], stderr: [...live.stderr] });
        } else if (chunk.type === "stderr") {
          live.stderr.push(chunk.line);
          setStreamState({ stdout: [...live.stdout], stderr: [...live.stderr] });
        } else {
          finalResult = {
            ok: true,
            result: {
              stdout: live.stdout.length > 0 ? `${live.stdout.join("\n")}\n` : "",
              stderr: live.stderr.length > 0 ? `${live.stderr.join("\n")}\n` : "",
              exit_code: chunk.exit_code,
              duration_ms: chunk.duration_ms,
              killed_by: chunk.killed_by,
              language: chunk.language,
              ...(chunk.runtime_version !== undefined && {
                runtime_version: chunk.runtime_version,
              }),
            },
          };
        }
      }
      setResult(finalResult);
      setRunning(false);
      if (finalResult?.ok) {
        const dur = finalResult.result.duration_ms;
        const exit_code = finalResult.result.exit_code ?? -1;
        capture.emit({
          type: "run",
          payload:
            dur !== null ? { language, exit_code, duration_ms: dur } : { language, exit_code },
        });
      }
      return;
    }
    const r = await runSandbox({
      language,
      files: sb.files,
      entry_file: sb.entry_file,
    });
    setResult(r);
    setRunning(false);
    if (r.ok) {
      const dur = r.result.duration_ms;
      // Sandbox returns `exit_code: null` when the process was killed (e.g. timeout). Stamp -1
      // as a sentinel so the telemetry has a real number to aggregate on.
      const exit_code = r.result.exit_code ?? -1;
      capture.emit({
        type: "run",
        payload: dur !== null ? { language, exit_code, duration_ms: dur } : { language, exit_code },
      });
    }
  }, [language, workspace, capture, streamOutput]);

  const status = useMemo(() => statusFor(result), [result]);
  const { breakpoint } = useViewportSize();
  const isNarrow = breakpoint === "mobile";

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <OfflineBanner />
      <div
        data-testid="playground-controls"
        data-breakpoint={breakpoint}
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: isNarrow ? "stretch" : "center",
          flexDirection: isNarrow ? "column" : "row",
          flexWrap: "wrap",
        }}
      >
        <label htmlFor="lang-select" style={{ fontWeight: 600 }}>
          Language
        </label>
        <select
          id="lang-select"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as SandboxLanguage)}
          disabled={running}
          style={{ padding: "0.4rem 0.6rem" }}
        >
          <option value="python">Python</option>
          <option value="typescript">TypeScript</option>
        </select>
        <button
          type="button"
          onClick={onRun}
          disabled={
            running ||
            (workspace.files.find((f) => f.path === workspace.entry_file)?.content.trim().length ??
              0) === 0
          }
          aria-busy={running}
          style={{
            padding: "0.5rem 1rem",
            background: running ? "#888" : "#0a7",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: running ? "wait" : "pointer",
            fontWeight: 600,
          }}
        >
          {running ? "Running…" : "Run"}
        </button>
        <span aria-live="polite">
          {status.tone === "idle" ? (
            <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span>
          ) : (
            <StatusBadge variant={status.tone}>{status.label}</StatusBadge>
          )}
        </span>
        <label
          style={{
            // marginLeft: auto pushes the streaming toggle to the right of the row on wide
            // screens; below the mobile breakpoint the row is column-stacked, so we drop the
            // auto-margin to keep the checkbox flush-left like every other control.
            marginLeft: isNarrow ? 0 : "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          title="Stream stdout/stderr lines as they're produced (STORY-059). Default off; the existing request/response UX is unchanged."
        >
          <input
            type="checkbox"
            checked={streamOutput}
            onChange={(e) => setStreamOutput(e.target.checked)}
            disabled={running}
            aria-label="Stream output as lines arrive"
            data-testid="stream-output-toggle"
          />
          <span style={{ fontSize: 13, color: "#555" }}>Stream output</span>
        </label>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          title="Voice capture is opt-in. Transcript ingestion lands once redaction is in place (STORY-056)."
        >
          <input
            type="checkbox"
            checked={voiceOptIn}
            onChange={(e) => setVoiceOptIn(e.target.checked)}
            aria-label="Enable voice capture (preview)"
          />
          <span style={{ fontSize: 13, color: "#555" }}>Voice (preview)</span>
        </label>
      </div>

      <section
        role="region"
        aria-label="Code editor"
        aria-describedby="playground-editor-help"
        style={{
          display: "grid",
          gap: "0.4rem",
          gridTemplateColumns: isNarrow ? "minmax(0, 1fr)" : "220px minmax(0, 1fr)",
        }}
      >
        <FileTreeSidebar
          state={workspace}
          onSetActive={(p) => dispatchWithError({ type: "set_active", path: p })}
          onCreate={(p) => dispatchWithError({ type: "create", path: p })}
          onRename={(from, to) => dispatchWithError({ type: "rename", from, to })}
          onDelete={(p) => dispatchWithError({ type: "delete", path: p })}
          onSetEntry={(p) => dispatchWithError({ type: "set_entry", path: p })}
          error={workspaceError}
          onClearError={() => setWorkspaceError(null)}
        />
        <div style={{ display: "grid", gap: "0.4rem" }}>
          <div style={{ border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}>
            <Editor
              height="360px"
              language={languageForPath(workspace.active_path, language)}
              path={workspace.active_path}
              value={code}
              theme="vs-dark"
              onChange={(v) => onCodeChange(v ?? "")}
              onMount={onEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                scrollBeyondLastLine: false,
                tabFocusMode: false,
                ariaLabel: "Code editor",
              }}
            />
          </div>
          <p id="playground-editor-help" style={{ margin: 0, fontSize: 12, color: "#666" }}>
            Keyboard: <kbd>Esc</kbd> exits the editor focus trap; <kbd>Shift</kbd> + <kbd>F10</kbd>{" "}
            opens the context menu. Editing: <code>{workspace.active_path}</code>.
          </p>
        </div>
      </section>

      <ResultPanel result={result} running={running} streamState={streamState} />

      <PasteDetectModal
        paste={pasteDetect.paste}
        onMyCode={pasteDetect.dismiss}
        onGotHelp={pasteDetect.gotHelp}
      />
    </div>
  );
}

function ResultPanel({
  result,
  running,
  streamState,
}: {
  result: RunSandboxResult | null;
  running: boolean;
  streamState: StreamingState | null;
}) {
  if (running && streamState !== null) {
    // STORY-059 — streaming mode in flight. Show the partial output as it arrives so the
    // user gets immediate feedback instead of waiting for the full request/response.
    return (
      <section
        aria-live="polite"
        style={{ display: "grid", gap: "0.5rem" }}
        data-testid="stream-panel"
      >
        <div style={{ color: "#666", fontSize: 13 }}>Streaming output…</div>
        <Block
          label="stdout"
          value={streamState.stdout.join("\n")}
          emptyHint="(awaiting stdout…)"
        />
        <Block
          label="stderr"
          value={streamState.stderr.join("\n")}
          emptyHint="(awaiting stderr…)"
          tone="warn"
        />
      </section>
    );
  }
  if (running) {
    return (
      <section aria-live="polite" style={{ color: "#666" }}>
        Running in sandbox…
      </section>
    );
  }
  if (result === null) {
    return (
      <section aria-live="polite" style={{ color: "#888" }}>
        Result will appear here after you press Run.
      </section>
    );
  }

  if (!result.ok) {
    const sandboxBlocked = result.error === "sandbox_unavailable";
    return (
      <section
        aria-live="polite"
        style={{
          padding: "0.75rem",
          background: "#fee",
          border: "1px solid #f99",
          borderRadius: 4,
        }}
      >
        <strong>Run failed</strong>
        <div>
          <code>{result.error}</code>
          {result.message ? ` — ${result.message}` : ""}
        </div>
        {sandboxBlocked ? (
          <div style={{ marginTop: "0.5rem", fontSize: 13, color: "#555" }}>
            The Piston sandbox isn&apos;t reachable. On Docker Desktop for Windows this is a known
            limitation (cgroup v2 isn&apos;t writable inside the container).{" "}
            <a
              href="https://github.com/khoks/LearnPro/blob/main/docs/operations/SANDBOX.md"
              target="_blank"
              rel="noreferrer"
            >
              Workarounds in docs/operations/SANDBOX.md →
            </a>
          </div>
        ) : null}
      </section>
    );
  }

  const r = result.result;
  return (
    <section aria-live="polite" style={{ display: "grid", gap: "0.5rem" }}>
      <Meta r={r} />
      <Block label="stdout" value={r.stdout} emptyHint="(no stdout)" />
      <Block label="stderr" value={r.stderr} emptyHint="(no stderr)" tone="warn" />
    </section>
  );
}

function Meta({ r }: { r: SandboxRunResponse }) {
  const fields: { k: string; v: string | number | null }[] = [
    { k: "language", v: r.language },
    { k: "runtime", v: r.runtime_version ?? "?" },
    { k: "exit_code", v: r.exit_code },
    { k: "duration_ms", v: r.duration_ms },
    { k: "killed_by", v: r.killed_by },
  ];
  return (
    <ul
      style={{
        display: "flex",
        gap: "1rem",
        padding: 0,
        margin: 0,
        listStyle: "none",
        flexWrap: "wrap",
        fontSize: 13,
        color: "#333",
      }}
    >
      {fields.map((f) => (
        <li key={f.k}>
          <strong>{f.k}:</strong> <code>{f.v === null ? "null" : String(f.v)}</code>
        </li>
      ))}
    </ul>
  );
}

function Block({
  label,
  value,
  emptyHint,
  tone,
}: {
  label: string;
  value: string;
  emptyHint: string;
  tone?: "warn";
}) {
  const trimmed = value ?? "";
  const isEmpty = trimmed.length === 0;
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{label}</div>
      <pre
        style={{
          margin: 0,
          padding: "0.5rem",
          background: tone === "warn" ? "#fff8e1" : "#f6f6f6",
          border: "1px solid #ddd",
          borderRadius: 4,
          fontSize: 13,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 240,
          overflow: "auto",
        }}
      >
        {isEmpty ? emptyHint : trimmed}
      </pre>
    </div>
  );
}
