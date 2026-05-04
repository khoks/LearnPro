"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { HintRung } from "@learnpro/agent";
import { runSandbox, type RunSandboxResult } from "../../lib/run-sandbox";
import {
  useInteractionCapture,
  type MonacoLikeEditor,
} from "../../lib/use-interaction-capture";
import {
  initialSessionState,
  nextHintRung,
  transition,
  type SessionEvent,
  type SessionState,
} from "../../lib/session-state";
import {
  driveAssign,
  driveFinish,
  driveHint,
  driveSubmit,
} from "../../lib/session-driver";
import {
  DifficultyBadge,
  ErrorBanner,
  GradeResultPanel,
  HintHistory,
  SkillUpdateSummary,
} from "./session-view";

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

export interface SessionClientProps {
  trackId: string;
}

export function SessionClient({ trackId }: SessionClientProps) {
  const [state, dispatch] = useReducer(reducer, initialSessionState);
  const [code, setCode] = useState<string>("");
  const [runResult, setRunResult] = useState<RunSandboxResult | null>(null);
  const [running, setRunning] = useState(false);
  const capture = useInteractionCapture();
  const assigningRef = useRef(false);

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
      setCode(succeeded.assigned.problem.starter_code);
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
    },
    [capture],
  );

  const onRun = useCallback(async () => {
    if (state.phase !== "coding" && state.phase !== "grading") return;
    const language = state.assigned.problem.language;
    setRunning(true);
    setRunResult(null);
    const r = await runSandbox({ language, code });
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
  }, [state, code, capture]);

  const onSubmit = useCallback(async () => {
    if (state.phase !== "coding" && state.phase !== "grading") return;
    const { events } = await driveSubmit(state, code);
    for (const ev of events) dispatch(ev);
    const succeeded = events.find(
      (e): e is Extract<SessionEvent, { type: "submit_succeeded" }> =>
        e.type === "submit_succeeded",
    );
    if (succeeded) {
      capture.emit({ type: "submit", payload: { passed: succeeded.grade.passed } });
    }
  }, [state, code, capture]);

  const onRequestHint = useCallback(async () => {
    if (state.phase !== "coding" && state.phase !== "grading") return;
    const rung = nextHintRung(state.hints);
    if (rung === null) return;
    capture.emit({ type: "hint_request", payload: { rung } });
    const { events } = await driveHint(state, rung);
    for (const ev of events) dispatch(ev);
    const succeeded = events.find(
      (e): e is Extract<SessionEvent, { type: "hint_succeeded" }> =>
        e.type === "hint_succeeded",
    );
    if (succeeded) {
      capture.emit({ type: "hint_received", payload: { rung: succeeded.hint.rung } });
    }
  }, [state, capture]);

  const onFinish = useCallback(async () => {
    if (state.phase !== "coding" && state.phase !== "grading") return;
    const { events } = await driveFinish(state);
    for (const ev of events) dispatch(ev);
    const succeeded = events.some((e) => e.type === "finish_succeeded");
    if (succeeded) void capture.flush();
  }, [state, capture]);

  const onNext = useCallback(() => {
    setRunResult(null);
    setCode("");
    dispatch({ type: "reset" });
  }, []);

  return (
    <SessionView
      state={state}
      code={code}
      onCodeChange={setCode}
      onEditorMount={onEditorMount}
      runResult={runResult}
      running={running}
      onRun={onRun}
      onSubmit={onSubmit}
      onRequestHint={onRequestHint}
      onFinish={onFinish}
      onNext={onNext}
      onDismissError={() => dispatch({ type: "dismiss_error" })}
    />
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

      <div
        style={{ border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}
        aria-label="Code editor"
      >
        <Editor
          height="360px"
          language={MONACO_LANGUAGE[language]}
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
      </div>

      {props.runResult && <RunResultPanel result={props.runResult} />}

      {grade && <GradeResultPanel grade={grade} />}

      {isFinished && <SkillUpdateSummary profile={state.profile} onNext={props.onNext} />}
    </section>
  );
}

function Header({ assigned }: { assigned: ActiveStateProps["state"]["assigned"] }) {
  return (
    <header style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{assigned.problem.name}</h2>
        <DifficultyBadge tier={assigned.difficulty_tier} />
        <span style={{ fontSize: 13, color: "#666" }}>{assigned.problem.language}</span>
      </div>
      <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#222", lineHeight: 1.5 }}>
        {assigned.problem.statement}
      </p>
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
