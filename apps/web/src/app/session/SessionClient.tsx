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
  friendlyError,
  initialSessionState,
  nextHintRung,
  transition,
  type HintEntry,
  type SessionEvent,
  type SessionState,
} from "../../lib/session-state";
import {
  assignEpisode,
  finishEpisode,
  requestHint,
  submitCode,
} from "../../lib/tutor-api";

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
    dispatch({ type: "assign_started" });
    const r = await assignEpisode({ track_id: trackId });
    assigningRef.current = false;
    if (!r.ok) {
      dispatch({ type: "assign_failed", error: r.error });
      return;
    }
    const assigned = {
      episode_id: r.data.episode_id,
      problem_id: r.data.problem_id,
      problem_slug: r.data.problem_slug,
      problem: r.data.problem,
      difficulty_tier: r.data.difficulty_tier,
      why_this_difficulty: r.data.why_this_difficulty,
      started_at: r.data.started_at,
    };
    setCode(r.data.problem.starter_code);
    setRunResult(null);
    dispatch({ type: "assign_succeeded", assigned });
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
    const episode_id = state.assigned.episode_id;
    dispatch({ type: "submit", code });
    const r = await submitCode(episode_id, code);
    if (!r.ok) {
      dispatch({ type: "submit_failed", error: r.error });
      return;
    }
    capture.emit({ type: "submit", payload: { passed: r.data.passed } });
    dispatch({ type: "submit_succeeded", grade: r.data });
  }, [state, code, capture]);

  const onRequestHint = useCallback(async () => {
    if (state.phase !== "coding" && state.phase !== "grading") return;
    const rung = nextHintRung(state.hints);
    if (rung === null) return;
    const episode_id = state.assigned.episode_id;
    capture.emit({ type: "hint_request", payload: { rung } });
    dispatch({ type: "request_hint", rung });
    const r = await requestHint(episode_id, rung);
    if (!r.ok) {
      dispatch({ type: "hint_failed", error: r.error });
      return;
    }
    capture.emit({ type: "hint_received", payload: { rung: r.data.rung } });
    const hint: HintEntry = { rung: r.data.rung, hint: r.data.hint, xp_cost: r.data.xp_cost };
    dispatch({ type: "hint_succeeded", hint });
  }, [state, capture]);

  const onFinish = useCallback(async () => {
    if (state.phase !== "coding" && state.phase !== "grading") return;
    const episode_id = state.assigned.episode_id;
    dispatch({ type: "finish" });
    const r = await finishEpisode(episode_id);
    if (!r.ok) {
      dispatch({ type: "finish_failed", error: r.error });
      return;
    }
    void capture.flush();
    dispatch({ type: "finish_succeeded", profile: r.data });
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
  const nextRung = state.phase !== "finished" && state.phase !== "finishing" ? nextHintRung(hints) : null;
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

      {isFinished && (
        <SkillUpdateSummary
          profile={state.profile}
          onNext={props.onNext}
        />
      )}
    </section>
  );
}

function Header({ assigned }: { assigned: ActiveStateProps["state"]["assigned"] }) {
  return (
    <header style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{assigned.problem.name}</h2>
        <DifficultyBadge tier={assigned.difficulty_tier} />
        <span style={{ fontSize: 13, color: "#666" }}>
          {assigned.problem.language}
        </span>
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

function DifficultyBadge({ tier }: { tier: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    easy: { bg: "#e8f5e9", fg: "#1b5e20" },
    medium: { bg: "#fff8e1", fg: "#827717" },
    hard: { bg: "#ffe0b2", fg: "#bf360c" },
    expert: { bg: "#ffebee", fg: "#b71c1c" },
  };
  const p = palette[tier] ?? { bg: "#eee", fg: "#333" };
  return (
    <span
      style={{
        background: p.bg,
        color: p.fg,
        padding: "0.15rem 0.5rem",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {tier}
    </span>
  );
}

function HintHistory({ hints }: { hints: HintEntry[] }) {
  if (hints.length === 0) return null;
  return (
    <div aria-label="Hint history" style={{ display: "grid", gap: "0.5rem" }}>
      {hints.map((h, i) => (
        <div
          key={i}
          style={{
            background: "#fffde7",
            border: "1px solid #fff59d",
            borderRadius: 6,
            padding: "0.6rem 0.75rem",
            fontSize: 14,
            lineHeight: 1.45,
            whiteSpace: "pre-wrap",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#827717", marginBottom: 4 }}>
            Hint (rung {h.rung} — {h.xp_cost} XP)
          </div>
          {h.hint}
        </div>
      ))}
    </div>
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
  const baseLabel =
    loading ? "Hint loading…" : rung === null ? "Hint (no more)" : `Hint (rung ${rung})`;
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

function ErrorBanner({
  error,
  onDismiss,
  retryLabel,
}: {
  error: { status: number; code: string; message: string };
  onDismiss: () => void;
  retryLabel: string;
}) {
  return (
    <div
      role="alert"
      style={{
        padding: "0.6rem 0.75rem",
        background: "#fee",
        border: "1px solid #f99",
        borderRadius: 4,
        color: "#a00",
        display: "flex",
        gap: "0.6rem",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <span>
        <strong>{error.status > 0 ? error.status : "Network"}:</strong> {error.message}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "1px solid #a00",
          color: "#a00",
          padding: "0.25rem 0.6rem",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        {retryLabel}
      </button>
    </div>
  );
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
        <strong>exit_code:</strong> {String(r.exit_code)} ·{" "}
        <strong>duration_ms:</strong> {String(r.duration_ms)} ·{" "}
        <strong>killed_by:</strong> {String(r.killed_by)}
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

function GradeResultPanel({ grade }: { grade: import("@learnpro/agent").GradeOutput }) {
  return (
    <section
      aria-label="Grade result"
      style={{
        display: "grid",
        gap: "0.6rem",
        padding: "0.75rem",
        border: "1px solid #ccc",
        borderRadius: 6,
        background: grade.passed ? "#f1f8e9" : "#fff3e0",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16, color: grade.passed ? "#1b5e20" : "#bf360c" }}>
        {grade.passed ? "All hidden tests passed" : "Some hidden tests failed"}
      </div>
      <RubricBars rubric={grade.rubric} />
      <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
        {grade.prose_explanation}
      </p>
      <HiddenTestsTable results={grade.hidden_test_results} />
      <div style={{ fontSize: 12, color: "#666" }}>
        runtime: {grade.runtime_ms} ms · submission: <code>{grade.submission_id}</code>
      </div>
    </section>
  );
}

function RubricBars({ rubric }: { rubric: import("@learnpro/agent").GradeOutput["rubric"] }) {
  const rows: Array<[string, number]> = [
    ["correctness", rubric.correctness],
    ["idiomatic", rubric.idiomatic],
    ["edge case coverage", rubric.edge_case_coverage],
  ];
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.35rem" }}>
      {rows.map(([label, value]) => (
        <li key={label}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              marginBottom: 2,
            }}
          >
            <span style={{ textTransform: "capitalize" }}>{label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "#555" }}>
              {Math.round(value * 100)}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(value * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
            style={{
              height: 10,
              background: "#e0e0e0",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(value * 100)}%`,
                height: "100%",
                background: barColor(value),
                transition: "width 200ms ease",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function barColor(value: number): string {
  if (value >= 0.8) return "#2e7d32";
  if (value >= 0.5) return "#f9a825";
  return "#c62828";
}

function HiddenTestsTable({
  results,
}: {
  results: import("@learnpro/agent").GradeOutput["hidden_test_results"];
}) {
  if (results.length === 0) return null;
  return (
    <table
      aria-label="Hidden tests"
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 13,
      }}
    >
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
          <th style={{ padding: "0.3rem 0.4rem" }}>#</th>
          <th style={{ padding: "0.3rem 0.4rem" }}>verdict</th>
          <th style={{ padding: "0.3rem 0.4rem" }}>detail</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r) => (
          <tr key={r.index} style={{ borderBottom: "1px dashed #eee" }}>
            <td style={{ padding: "0.3rem 0.4rem", fontVariantNumeric: "tabular-nums" }}>
              {r.index}
            </td>
            <td
              style={{
                padding: "0.3rem 0.4rem",
                color: r.passed ? "#1b5e20" : "#bf360c",
                fontWeight: 600,
              }}
            >
              {r.passed ? "pass" : "fail"}
            </td>
            <td style={{ padding: "0.3rem 0.4rem", color: "#555" }}>
              {r.passed ? "" : r.detail ?? formatExpectedGot(r.expected, r.got)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatExpectedGot(expected: unknown, got: unknown): string {
  if (expected === undefined && got === undefined) return "mismatch";
  return `expected=${JSON.stringify(expected)} got=${JSON.stringify(got)}`;
}

function SkillUpdateSummary({
  profile,
  onNext,
}: {
  profile: import("@learnpro/agent").UpdateProfileOutput;
  onNext: () => void;
}) {
  return (
    <section
      aria-label="Skill update"
      style={{
        display: "grid",
        gap: "0.6rem",
        padding: "0.75rem",
        border: "1px solid #c5e1a5",
        background: "#f1f8e9",
        borderRadius: 6,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16 }}>
        Episode finished — {humanizeOutcome(profile.final_outcome)}
      </div>
      <div style={{ fontSize: 13, color: "#555" }}>
        time: {Math.round(profile.time_to_solve_ms / 1000)}s · attempts: {profile.attempts} · hints:{" "}
        {profile.hints_used}
      </div>
      {profile.skill_updates.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.3rem" }}>
          {profile.skill_updates.map((u) => {
            const delta = u.next_skill - u.prev_skill;
            const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
            const tone = delta > 0 ? "#1b5e20" : delta < 0 ? "#c62828" : "#666";
            return (
              <li
                key={u.concept_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  borderBottom: "1px dashed #c5e1a5",
                  padding: "0.2rem 0",
                }}
              >
                <span style={{ fontWeight: 600 }}>{u.concept_slug}</span>
                <span style={{ color: tone, fontVariantNumeric: "tabular-nums" }}>
                  {u.prev_skill.toFixed(2)} {arrow} {u.next_skill.toFixed(2)} (conf{" "}
                  {u.next_confidence.toFixed(2)})
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div style={{ fontSize: 13, color: "#666" }}>No tracked concepts updated.</div>
      )}
      <button
        type="button"
        onClick={onNext}
        style={{
          padding: "0.55rem 0.9rem",
          background: "#0a7",
          color: "white",
          border: "none",
          borderRadius: 4,
          fontWeight: 600,
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        Next problem
      </button>
    </section>
  );
}

function humanizeOutcome(o: import("@learnpro/agent").FinalOutcome): string {
  switch (o) {
    case "passed":
      return "passed cleanly";
    case "passed_with_hints":
      return "passed with hints";
    case "failed":
      return "didn't pass yet";
    case "abandoned":
      return "abandoned";
    case "revealed":
      return "solution revealed";
  }
}
