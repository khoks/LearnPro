"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { HintRung } from "@learnpro/agent";
import { OfflineBanner } from "../../components/pwa/OfflineBanner";
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
import { useInteractionCapture, type MonacoLikeEditor } from "../../lib/use-interaction-capture";
import { useViewportSize } from "../../lib/use-viewport-size";
import {
  initialSessionState,
  nextHintRung,
  transition,
  type SessionEvent,
  type SessionState,
} from "../../lib/session-state";
import { driveAssign, driveFinish, driveHint, driveSubmit } from "../../lib/session-driver";
import {
  initialPlanState,
  planReducer,
  type SessionPlan,
  type SessionPlanAction,
  type SessionPlanState,
} from "../../lib/session-plan-state";
import { SessionPlanSidebar } from "./SessionPlanSidebar";
import {
  DebugProblemPanel,
  DifficultyBadge,
  ErrorBanner,
  GradeResultPanel,
  HintHistory,
  KindBadge,
  SkillUpdateSummary,
} from "./session-view";

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

const MONACO_LANGUAGE: Record<"python" | "typescript", string> = {
  python: "python",
  typescript: "typescript",
};

function reducer(state: SessionState, event: SessionEvent): SessionState {
  return transition(state, event);
}

function planStateReducer(s: SessionPlanState, a: SessionPlanAction): SessionPlanState {
  return planReducer(s, a);
}

// STORY-043 — workspace reducer thunk; same pattern as PlaygroundClient.
function workspaceReducer(
  state: WorkspaceFileTreeState,
  action: WorkspaceFileTreeAction,
): WorkspaceFileTreeState {
  return workspaceFileTreeReducer(state, action).state;
}

// STORY-043 — per-language entry-file convention.  Mirrors `ENTRY_FILE_BY_LANGUAGE` in
// @learnpro/sandbox; see PlaygroundClient for the same constant.
const ENTRY_FILE_FOR: Record<"python" | "typescript", string> = {
  python: "main.py",
  typescript: "index.ts",
};

// Empty starter — used as a placeholder until the first assign lands.
const EMPTY_WORKSPACE = initWorkspaceFileTree([{ path: "main.py", content: "" }]);

// STORY-043 — derive the Monaco language id from a file's extension.
function languageForPath(path: string, fallback: "python" | "typescript"): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return MONACO_LANGUAGE[fallback];
}

export interface SessionClientProps {
  trackId: string;
}

export function SessionClient({ trackId }: SessionClientProps) {
  const [state, dispatch] = useReducer(reducer, initialSessionState);
  // STORY-043 — workspace state.  Single-file problems (no `starter_workspace` on the
  // assigned problem) seed a 1-file workspace so the legacy UX is unchanged.  Multi-file
  // problems pre-populate the file tree with the authored scaffold on assign.
  const [workspace, dispatchWorkspace] = useReducer(workspaceReducer, EMPTY_WORKSPACE);
  const [workspaceError, setWorkspaceError] = useState<WorkspaceFileTreeError | null>(null);
  const [runResult, setRunResult] = useState<RunSandboxResult | null>(null);
  const [running, setRunning] = useState(false);
  // STORY-042 — per-submission "I got help on this one" toggle. Default OFF; flips ON when the
  // paste-detect modal's "I got help" path is chosen, OR when the user toggles it manually in the
  // result panel. Reset on Next-problem so it doesn't leak across episodes.
  const [gotHelp, setGotHelp] = useState<boolean>(false);
  const [planState, planDispatch] = useReducer(planStateReducer, initialPlanState);
  const capture = useInteractionCapture();
  const pasteDetect = usePasteDetect({ onGotHelp: () => setGotHelp(true) });
  const activeFile = workspace.files.find((f) => f.path === workspace.active_path);
  const code = activeFile?.content ?? "";
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);
  const assigningRef = useRef(false);
  const planFetchingRef = useRef(false);

  const dispatchWorkspaceWithError = useCallback(
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

  const loadOrCreatePlan = useCallback(async () => {
    if (planFetchingRef.current) return;
    planFetchingRef.current = true;
    try {
      const getRes = await fetch("/api/session-plan", { method: "GET" });
      if (!getRes.ok) {
        planDispatch({ type: "load_failed", message: "Couldn't load today's plan." });
        return;
      }
      const getJson = (await getRes.json()) as { plan: SessionPlan | null };
      if (getJson.plan) {
        planDispatch({ type: "load_succeeded", plan: getJson.plan, fallback: false });
        return;
      }
      const postRes = await fetch("/api/session-plan", { method: "POST" });
      if (!postRes.ok) {
        planDispatch({ type: "load_failed", message: "Couldn't generate today's plan." });
        return;
      }
      const postJson = (await postRes.json()) as {
        plan: SessionPlan | null;
        fallback?: boolean;
      };
      planDispatch({
        type: "load_succeeded",
        plan: postJson.plan,
        fallback: postJson.fallback ?? false,
      });
    } catch (err) {
      planDispatch({
        type: "load_failed",
        message: err instanceof Error ? err.message : "Couldn't reach the plan service.",
      });
    } finally {
      planFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadOrCreatePlan();
  }, [loadOrCreatePlan]);

  const markPlanItem = useCallback(async (slug: string, episode_id: string) => {
    try {
      const res = await fetch(`/api/session-plan/items/${encodeURIComponent(slug)}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ episode_id }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { plan: SessionPlan | null };
      if (json.plan) planDispatch({ type: "item_marked", plan: json.plan });
    } catch {
      // Best-effort: if the auto-mark fails the plan stays as-is.
    }
  }, []);

  const startEpisode = useCallback(async () => {
    if (assigningRef.current) return;
    assigningRef.current = true;
    const { events } = await driveAssign({ phase: "assigning" }, trackId);
    assigningRef.current = false;
    for (const ev of events) dispatch(ev);
    const succeeded = events.find(
      (e): e is Extract<SessionEvent, { type: "assign_succeeded" }> =>
        e.type === "assign_succeeded",
    );
    if (succeeded) {
      // STORY-043 — assigned problems may carry an authored `starter_workspace` (multi-file)
      // OR a legacy `starter_code` string.  Seed the workspace either way.  When neither is
      // present we fall back to a 1-file workspace with the language-default entry filename.
      const problem = succeeded.assigned.problem as {
        language: "python" | "typescript";
        starter_code: string;
        starter_workspace?: ReadonlyArray<{ path: string; content: string }>;
        entry_file?: string;
      };
      const entryFile = problem.entry_file ?? ENTRY_FILE_FOR[problem.language];
      if (problem.starter_workspace && problem.starter_workspace.length > 0) {
        dispatchWorkspace({
          type: "replace",
          files: problem.starter_workspace.map((f) => ({ path: f.path, content: f.content })),
          entry_file: entryFile,
          active_path: entryFile,
        });
      } else {
        dispatchWorkspace({
          type: "replace",
          files: [{ path: entryFile, content: problem.starter_code }],
          entry_file: entryFile,
          active_path: entryFile,
        });
      }
      setWorkspaceError(null);
      setRunResult(null);
    }
  }, [trackId]);

  // Kick off the first assign on mount (and again on each `reset` → assigning transition).
  useEffect(() => {
    if (state.phase === "assigning") void startEpisode();
  }, [state.phase, startEpisode]);

  const onEditorMount = useCallback(
    (editor: unknown) => {
      // Monaco's IStandaloneCodeEditor matches our structural MonacoLikeEditor.
      capture.attach(editor as MonacoLikeEditor);
      attachPasteListener(editor, (text) => {
        pasteDetect.notifyPaste({ text, current_content: codeRef.current });
      });
    },
    [capture, pasteDetect],
  );

  const onRun = useCallback(async () => {
    if (state.phase !== "coding" && state.phase !== "grading") return;
    const language = state.assigned.problem.language;
    setRunning(true);
    setRunResult(null);
    // STORY-043 — Run ships the full workspace.  Single-file workspaces (the default for
    // legacy `starter_code` problems) materialize as a 1-file array, which the sandbox
    // accepts identically to the legacy `code` shorthand.
    const sb = toSandboxFiles(workspace);
    const r = await runSandbox({
      language,
      files: sb.files,
      entry_file: sb.entry_file,
    });
    setRunResult(r);
    setRunning(false);
    if (r.ok) {
      const dur = r.result.duration_ms;
      const exit_code = r.result.exit_code ?? -1;
      capture.emit({
        type: "run",
        payload: dur !== null ? { language, exit_code, duration_ms: dur } : { language, exit_code },
      });
    }
  }, [state, workspace, capture]);

  const onSubmit = useCallback(async () => {
    if (state.phase !== "coding" && state.phase !== "grading") return;
    const episodeIdForSubmit = state.assigned.episode_id;
    // STORY-043 — for multi-file workspaces, Submit ships the entry file's content as the
    // single-file `code` payload.  The agent's grade tool still uses the single-file harness
    // path; multi-file grade is a deferred follow-up (the validator has the multi-file
    // harness builder in place, the agent doesn't yet).  Single-file workspaces (the default
    // for legacy `starter_code` problems) submit the only file's content unchanged.
    const entryContent =
      workspace.files.find((f) => f.path === workspace.entry_file)?.content ?? code;
    const { events } = await driveSubmit(state, entryContent);
    for (const ev of events) dispatch(ev);
    const succeeded = events.find(
      (e): e is Extract<SessionEvent, { type: "submit_succeeded" }> =>
        e.type === "submit_succeeded",
    );
    if (succeeded) {
      capture.emit({ type: "submit", payload: { passed: succeeded.grade.passed } });
      // STORY-042 — when the user opted in, flip episodes.got_help via the API. The submission
      // itself is graded normally above; this PATCH is a secondary, idempotent side-effect. Soft-
      // fail: a network hiccup leaves got_help=false, which is the conservative direction.
      if (gotHelp) {
        void persistGotHelp(episodeIdForSubmit, true);
      }
    }
  }, [state, code, workspace, capture, gotHelp]);

  const onRequestHint = useCallback(async () => {
    if (state.phase !== "coding" && state.phase !== "grading") return;
    const rung = nextHintRung(state.hints);
    if (rung === null) return;
    capture.emit({ type: "hint_request", payload: { rung } });
    const { events } = await driveHint(state, rung);
    for (const ev of events) dispatch(ev);
    const succeeded = events.find(
      (e): e is Extract<SessionEvent, { type: "hint_succeeded" }> => e.type === "hint_succeeded",
    );
    if (succeeded) {
      capture.emit({ type: "hint_received", payload: { rung: succeeded.hint.rung } });
    }
  }, [state, capture]);

  const onFinish = useCallback(async () => {
    if (state.phase !== "coding" && state.phase !== "grading") return;
    const finishingFromSlug = state.assigned.problem_slug;
    const finishingEpisodeId = state.assigned.episode_id;
    const { events } = await driveFinish(state);
    for (const ev of events) dispatch(ev);
    const succeeded = events.some((e) => e.type === "finish_succeeded");
    if (succeeded) {
      void capture.flush();
      // STORY-015 — auto-mark the matching plan item from the client too. The server-side
      // updateProfile already does this when DATABASE_URL is set; this keeps the UI snappy
      // (the sidebar updates immediately) and also covers the dev-without-DB code path.
      void markPlanItem(finishingFromSlug, finishingEpisodeId);
    }
  }, [state, capture, markPlanItem]);

  const onNext = useCallback(() => {
    setRunResult(null);
    // STORY-043 — workspace reset to a 1-file empty buffer; the next assign will replace it
    // with the new problem's `starter_workspace` (or single-file `starter_code`).
    dispatchWorkspace({
      type: "replace",
      files: [{ path: "main.py", content: "" }],
      entry_file: "main.py",
    });
    setWorkspaceError(null);
    setGotHelp(false);
    dispatch({ type: "reset" });
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

  return (
    <>
      <OfflineBanner />
      <SessionLayout
        planSidebar={
          <SessionPlanSidebar
            state={planState}
            onSkip={() => planDispatch({ type: "skip" })}
            onRetry={loadOrCreatePlan}
          />
        }
      >
        <SessionView
          state={state}
          code={code}
          onCodeChange={onCodeChange}
          onEditorMount={onEditorMount}
          runResult={runResult}
          running={running}
          onRun={onRun}
          onSubmit={onSubmit}
          onRequestHint={onRequestHint}
          onFinish={onFinish}
          onNext={onNext}
          onDismissError={() => dispatch({ type: "dismiss_error" })}
          gotHelp={gotHelp}
          onGotHelpChange={setGotHelp}
          workspace={workspace}
          workspaceError={workspaceError}
          onWorkspaceAction={dispatchWorkspaceWithError}
          onClearWorkspaceError={() => setWorkspaceError(null)}
        />
      </SessionLayout>
      <PasteDetectModal
        paste={pasteDetect.paste}
        onMyCode={pasteDetect.dismiss}
        onGotHelp={pasteDetect.gotHelp}
      />
    </>
  );
}

// STORY-042 — POSTs `got_help` to the API for an episode. Idempotent (the helper UPSERTs the
// boolean). Soft-fails on network errors so a hiccup never blocks the user from continuing.
async function persistGotHelp(episode_id: string, got_help: boolean): Promise<void> {
  try {
    await fetch(`/api/tutor/episodes/${encodeURIComponent(episode_id)}/got-help`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ got_help }),
    });
  } catch {
    // soft-fail: the conservative direction is got_help=false (skill bumps normally), which is
    // safe to skip when the user couldn't reach the API.
  }
}

// SessionLayout — a client component that picks between the laptop 2-column grid (sidebar
// always visible to the right) and the <1024 single-column drawer (sidebar collapsed behind a
// "Show plan" disclosure). The drawer state is local — it doesn't affect the plan reducer or
// session state — so collapsing the drawer is a purely-cosmetic toggle.
interface SessionLayoutProps {
  children: React.ReactNode;
  planSidebar: React.ReactNode;
}

function SessionLayout({ children, planSidebar }: SessionLayoutProps): React.ReactElement {
  const { breakpoint } = useViewportSize();
  const isLaptop = breakpoint === "laptop";
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (isLaptop) {
    return (
      <div
        data-testid="session-layout"
        data-breakpoint={breakpoint}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 280px",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        {children}
        {planSidebar}
      </div>
    );
  }

  // Below 1024: single column with a "Show plan" disclosure on top. Drawer is collapsed
  // by default so the editor stays the focal point.
  return (
    <div
      data-testid="session-layout"
      data-breakpoint={breakpoint}
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "1rem" }}
    >
      <button
        type="button"
        aria-expanded={drawerOpen}
        aria-controls="session-plan-drawer"
        onClick={() => setDrawerOpen((v) => !v)}
        data-testid="session-plan-toggle"
        style={{
          alignSelf: "flex-start",
          justifySelf: "flex-start",
          padding: "0.4rem 0.8rem",
          background: "#eee",
          border: "1px solid #ccc",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {drawerOpen ? "Hide plan" : "Show plan"}
      </button>
      {drawerOpen ? (
        <div id="session-plan-drawer" data-testid="session-plan-drawer">
          {planSidebar}
        </div>
      ) : null}
      {children}
    </div>
  );
}

interface SessionViewProps {
  state: SessionState;
  code: string;
  onCodeChange: (code: string) => void;
  onEditorMount: (editor: unknown) => void;
  runResult: RunSandboxResult | null;
  running: boolean;
  onRun: () => void;
  onSubmit: () => void;
  onRequestHint: () => void;
  onFinish: () => void;
  onNext: () => void;
  onDismissError: () => void;
  gotHelp: boolean;
  onGotHelpChange: (next: boolean) => void;
  // STORY-043 — multi-file workspace state piped through.
  workspace: WorkspaceFileTreeState;
  workspaceError: WorkspaceFileTreeError | null;
  onWorkspaceAction: (action: WorkspaceFileTreeAction) => void;
  onClearWorkspaceError: () => void;
}

function SessionView(props: SessionViewProps) {
  const { state } = props;
  if (state.phase === "assigning") {
    return (
      <section aria-live="polite" style={{ color: "#666", padding: "1rem 0" }}>
        Picking your next problem…
      </section>
    );
  }
  if (state.phase === "error") {
    return (
      <ErrorBanner error={state.error} onDismiss={props.onDismissError} retryLabel="Try again" />
    );
  }
  return <ActiveSessionView {...props} state={state} />;
}

interface ActiveStateProps extends Omit<SessionViewProps, "state"> {
  state: Exclude<SessionState, { phase: "assigning" } | { phase: "error" }>;
}

function ActiveSessionView(props: ActiveStateProps) {
  const { state } = props;
  const assigned = state.assigned;
  const language = assigned.problem.language;
  const hints = state.hints;
  const nextRung =
    state.phase !== "finished" && state.phase !== "finishing" ? nextHintRung(hints) : null;
  const grade = "grade" in state ? state.grade : "lastGrade" in state ? state.lastGrade : null;

  const isCoding = state.phase === "coding" || state.phase === "grading";
  const isLoadingHint = state.phase === "hint_loading";
  const isSubmitting = state.phase === "submitting";
  const isFinishing = state.phase === "finishing";
  const isFinished = state.phase === "finished";
  const editorDisabled = !isCoding;

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <Header assigned={assigned} />

      <HintHistory hints={hints} />

      <InlineErrorBanner state={state} onDismiss={props.onDismissError} />

      <section
        role="region"
        aria-label="Code editor"
        aria-describedby="session-editor-help"
        style={{
          display: "grid",
          gap: "0.4rem",
          gridTemplateColumns: "220px minmax(0, 1fr)",
        }}
      >
        <FileTreeSidebar
          state={props.workspace}
          onSetActive={(p) => props.onWorkspaceAction({ type: "set_active", path: p })}
          onCreate={(p) => props.onWorkspaceAction({ type: "create", path: p })}
          onRename={(from, to) => props.onWorkspaceAction({ type: "rename", from, to })}
          onDelete={(p) => props.onWorkspaceAction({ type: "delete", path: p })}
          onSetEntry={(p) => props.onWorkspaceAction({ type: "set_entry", path: p })}
          error={props.workspaceError}
          onClearError={props.onClearWorkspaceError}
          disabled={editorDisabled}
        />
        <div style={{ border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}>
          <Editor
            height="360px"
            language={languageForPath(props.workspace.active_path, language)}
            path={props.workspace.active_path}
            value={props.code}
            theme="vs-dark"
            onChange={(v) => props.onCodeChange(v ?? "")}
            onMount={props.onEditorMount}
            options={{
              readOnly: editorDisabled,
              minimap: { enabled: false },
              fontSize: 14,
              scrollBeyondLastLine: false,
              tabFocusMode: false,
              ariaLabel: "Code editor",
            }}
          />
        </div>
        <p id="session-editor-help" style={{ margin: 0, fontSize: 12, color: "#666" }}>
          Keyboard: <kbd>Esc</kbd> exits the editor focus trap; <kbd>Shift</kbd> + <kbd>F10</kbd>{" "}
          opens the context menu.
        </p>
      </section>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <ActionButton
          label={props.running ? "Running…" : "Run"}
          onClick={props.onRun}
          disabled={!isCoding || props.running || props.code.trim().length === 0}
          tone="run"
          busy={props.running}
        />
        <ActionButton
          label={isSubmitting ? "Submitting…" : "Submit"}
          onClick={props.onSubmit}
          disabled={!isCoding || props.code.trim().length === 0}
          tone="primary"
          busy={isSubmitting}
        />
        <HintButton
          rung={nextRung}
          loading={isLoadingHint}
          disabled={!isCoding || nextRung === null}
          onClick={props.onRequestHint}
        />
        <ActionButton
          label={isFinishing ? "Finishing…" : "Finish"}
          onClick={props.onFinish}
          disabled={!isCoding}
          tone="muted"
          busy={isFinishing}
        />
        <GotHelpToggle
          checked={props.gotHelp}
          onChange={props.onGotHelpChange}
          disabled={isFinished}
        />
      </div>

      {props.runResult && <RunResultPanel result={props.runResult} />}

      {grade && <GradeResultPanel grade={grade} />}

      {isFinished && <SkillUpdateSummary profile={state.profile} onNext={props.onNext} />}
    </section>
  );
}

// STORY-042 — per-submission "I got help on this one" toggle. OFF by default; flips ON when the
// paste-detect modal's "I got help" path is chosen (the parent's onGotHelp callback wires that).
// Coach-voice copy: never accusatory, never urgency. Disabled once the episode is finished — at
// that point the persisted got_help has already shaped the close.
function GotHelpToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label
      data-testid="got-help-toggle"
      title="Marking this keeps adaptiveness sharper — the system won't reward concept mastery for code that wasn't yours. Tests still run; XP still awards."
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginLeft: "auto",
        fontSize: 13,
        color: disabled ? "#999" : "#37474f",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label="I got help on this one"
        data-testid="got-help-toggle-input"
      />
      <span>I got help on this one</span>
    </label>
  );
}

function Header({ assigned }: { assigned: ActiveStateProps["state"]["assigned"] }) {
  // STORY-037 — debug-aware framing. Existing assign payloads from before STORY-037 don't carry a
  // `kind` field; treat them as "implement" so the legacy UI stays unchanged.
  const kind = (assigned.problem as { kind?: "implement" | "debug" }).kind ?? "implement";
  const expectedBehavior = (assigned.problem as { expected_behavior?: string | null })
    .expected_behavior;
  const bugArchetype = (assigned.problem as { bug_archetype?: string | null }).bug_archetype;
  return (
    <header style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{assigned.problem.name}</h2>
        <DifficultyBadge tier={assigned.difficulty_tier} />
        <KindBadge kind={kind} />
        <span style={{ fontSize: 13, color: "#666" }}>{assigned.problem.language}</span>
      </div>
      <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#222", lineHeight: 1.5 }}>
        {assigned.problem.statement}
      </p>
      {kind === "debug" && expectedBehavior ? (
        <DebugProblemPanel
          expectedBehavior={expectedBehavior}
          bugArchetype={bugArchetype ?? null}
        />
      ) : null}
      <p style={{ margin: 0, fontSize: 12, color: "#888" }} title={assigned.why_this_difficulty}>
        {assigned.why_this_difficulty}
      </p>
    </header>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  tone,
  busy,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone: "primary" | "run" | "muted";
  busy?: boolean;
}) {
  const palette = {
    primary: { bg: "#0a7", color: "white" },
    run: { bg: "#1976d2", color: "white" },
    muted: { bg: "#eee", color: "#333" },
  };
  const p = palette[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy ?? false}
      style={{
        padding: "0.5rem 0.9rem",
        background: disabled ? "#bbb" : p.bg,
        color: disabled ? "#fff" : p.color,
        border: "none",
        borderRadius: 4,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function HintButton({
  rung,
  loading,
  disabled,
  onClick,
}: {
  rung: HintRung | null;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const baseLabel = loading
    ? "Hint loading…"
    : rung === null
      ? "Hint (no more)"
      : `Hint (rung ${rung})`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      style={{
        padding: "0.5rem 0.9rem",
        background: disabled || loading ? "#bbb" : "#f9a825",
        color: "white",
        border: "none",
        borderRadius: 4,
        fontWeight: 600,
        cursor: disabled || loading ? "not-allowed" : "pointer",
      }}
    >
      {baseLabel}
    </button>
  );
}

function InlineErrorBanner({
  state,
  onDismiss,
}: {
  state: ActiveStateProps["state"];
  onDismiss: () => void;
}) {
  const lastError = "lastError" in state ? state.lastError : null;
  if (!lastError) return null;
  return <ErrorBanner error={lastError} onDismiss={onDismiss} retryLabel="Dismiss" />;
}

function RunResultPanel({ result }: { result: RunSandboxResult }) {
  if (!result.ok) {
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
      </section>
    );
  }
  const r = result.result;
  return (
    <section aria-label="Run output" style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ fontSize: 13, color: "#333" }}>
        <strong>exit_code:</strong> {String(r.exit_code)} · <strong>duration_ms:</strong>{" "}
        {String(r.duration_ms)} · <strong>killed_by:</strong> {String(r.killed_by)}
      </div>
      <Block label="stdout" value={r.stdout} emptyHint="(no stdout)" />
      <Block label="stderr" value={r.stderr} emptyHint="(no stderr)" tone="warn" />
    </section>
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
