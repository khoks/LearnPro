"use client";

import * as React from "react";
import type { FinalOutcome, GradeOutput, UpdateProfileOutput } from "@learnpro/agent";
import { StatusBadge } from "../../components/status-badge";
import type { HintEntry, SessionError } from "../../lib/session-state";
import {
  difficultyBadgePalette,
  formatExpectedGot,
  humanizeOutcome,
  rubricBarColor,
  rubricPct,
  skillDeltaArrow,
  skillDeltaSymbol,
} from "./session-view-helpers";
import { SaveToPortfolioButton } from "./SaveToPortfolioButton";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. (Without this, esbuild's classic JSX transform emits React.createElement calls and
// fails with `ReferenceError: React is not defined` at test-run time.)
void React;

// Pure visual components reused by SessionClient. They are framework-aware (return JSX) but
// have no fetch / state of their own — every input flows through props.

export function HintHistory({ hints }: { hints: ReadonlyArray<HintEntry> }) {
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

export function RubricBars({ rubric }: { rubric: GradeOutput["rubric"] }) {
  const rows: Array<[string, number]> = [
    ["correctness", rubric.correctness],
    ["idiomatic", rubric.idiomatic],
    ["edge case coverage", rubric.edge_case_coverage],
  ];
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.35rem" }}>
      {rows.map(([label, value]) => {
        const pct = rubricPct(value);
        return (
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
              <span style={{ fontVariantNumeric: "tabular-nums", color: "#555" }}>{pct}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={pct}
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
                  width: `${pct}%`,
                  height: "100%",
                  background: rubricBarColor(value),
                  transition: "width 200ms ease",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function HiddenTestsTable({ results }: { results: GradeOutput["hidden_test_results"] }) {
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
            <td style={{ padding: "0.3rem 0.4rem" }}>
              <StatusBadge variant={r.passed ? "pass" : "fail"}>
                {r.passed ? "pass" : "fail"}
              </StatusBadge>
            </td>
            <td style={{ padding: "0.3rem 0.4rem", color: "#555" }}>
              {r.passed ? "" : (r.detail ?? formatExpectedGot(r.expected, r.got))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SkillUpdateSummary({
  profile,
  onNext,
}: {
  profile: UpdateProfileOutput;
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
        Episode finished — {humanizeOutcome(profile.final_outcome as FinalOutcome)}
      </div>
      <div style={{ fontSize: 13, color: "#555" }}>
        time: {Math.round(profile.time_to_solve_ms / 1000)}s · attempts: {profile.attempts} · hints:{" "}
        {profile.hints_used}
      </div>
      {profile.skill_updates.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.3rem" }}>
          {profile.skill_updates.map((u) => {
            const arrow = skillDeltaArrow(u.next_skill - u.prev_skill);
            const tone = arrow === "up" ? "#1b5e20" : arrow === "down" ? "#c62828" : "#666";
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
                  {u.prev_skill.toFixed(2)} {skillDeltaSymbol(arrow)} {u.next_skill.toFixed(2)}{" "}
                  (conf {u.next_confidence.toFixed(2)})
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div style={{ fontSize: 13, color: "#666" }}>No tracked concepts updated.</div>
      )}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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
        <SaveToPortfolioButton
          episodeId={profile.episode_id}
          finalOutcome={profile.final_outcome}
        />
      </div>
    </section>
  );
}

export function GradeResultPanel({ grade }: { grade: GradeOutput }) {
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
      <div style={{ fontWeight: 700, fontSize: 16 }}>
        <StatusBadge variant={grade.passed ? "pass" : "fail"}>
          {grade.passed ? "All hidden tests passed" : "Some hidden tests failed"}
        </StatusBadge>
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

// STORY-037 — debug-problem framing panel. Renders below the header on `kind: "debug"` problems
// so the user knows the editor came pre-populated with broken code, what the code SHOULD do, and
// that hidden tests will run on submit. Coach-voice copy, no fire emoji or FOMO timers.
export function DebugProblemPanel({
  expectedBehavior,
  bugArchetype,
}: {
  expectedBehavior: string;
  bugArchetype: string | null;
}) {
  const archetypeLabel = bugArchetype ? humanizeArchetype(bugArchetype) : "one bug";
  return (
    <section
      data-testid="debug-problem-panel"
      aria-label="Debug problem panel"
      style={{
        display: "grid",
        gap: "0.5rem",
        padding: "0.75rem",
        background: "#fff8e1",
        border: "1px solid #ffe082",
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#5d4037" }}>
        This is a debug problem. The editor is pre-populated with code that has {archetypeLabel}.
      </div>
      <div style={{ fontSize: 13, color: "#5d4037" }}>
        <strong style={{ marginRight: 4 }}>What the code should do:</strong>
        <span style={{ whiteSpace: "pre-wrap" }}>{expectedBehavior}</span>
      </div>
      <div style={{ fontSize: 12, color: "#7d6043" }}>
        Hidden tests will run when you submit. The fix is usually small — read carefully.
      </div>
    </section>
  );
}

// STORY-037 / STORY-038 — small uppercase pill for the problem kind. "implement" hides (the legacy
// default shape stays visually unchanged); "debug" surfaces a yellow pill; "comprehension" surfaces
// a blue "Read" pill alongside the difficulty badge.
export function KindBadge({ kind }: { kind: "implement" | "debug" | "comprehension" }) {
  if (kind === "implement") return null;
  if (kind === "comprehension") {
    return (
      <span
        data-testid="kind-badge"
        style={{
          background: "#e3f2fd",
          color: "#0d47a1",
          padding: "0.15rem 0.5rem",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Read
      </span>
    );
  }
  return (
    <span
      data-testid="kind-badge"
      style={{
        background: "#fff3cd",
        color: "#7c5e00",
        padding: "0.15rem 0.5rem",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      Debug
    </span>
  );
}

// STORY-038 — comprehension framing panel. Renders below the header on `kind: "comprehension"`
// problems so the user knows the editor is read-only and the answer goes in the widget below.
// Coach-voice copy, no fire emoji or FOMO timers.
export function ComprehensionProblemPanel({
  comprehensionFormat,
}: {
  comprehensionFormat: "predict_output" | "trace_execution" | "reason_property" | null;
}) {
  const formatLabel = humanizeComprehensionFormat(comprehensionFormat);
  return (
    <section
      data-testid="comprehension-problem-panel"
      aria-label="Comprehension problem panel"
      style={{
        display: "grid",
        gap: "0.5rem",
        padding: "0.75rem",
        background: "#e3f2fd",
        border: "1px solid #90caf9",
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#0d47a1" }}>
        This is a comprehension exercise — {formatLabel}.
      </div>
      <div style={{ fontSize: 13, color: "#0d47a1" }}>
        The code editor is read-only. Pick the right answer (or write one) below the code.
      </div>
    </section>
  );
}

function humanizeComprehensionFormat(
  fmt: "predict_output" | "trace_execution" | "reason_property" | null,
): string {
  switch (fmt) {
    case "predict_output":
      return "predict the output";
    case "trace_execution":
      return "trace the execution";
    case "reason_property":
      return "reason about a property of the code";
    default:
      return "read the code";
  }
}

export interface ComprehensionAnswerState {
  selected_index: number | null;
  free_text: string;
}

// STORY-038 — comprehension answer widget. Renders multiple-choice radio buttons or a free-text
// textarea based on `answerFormat`. The state is fully controlled by the parent (so the parent
// can clear it on Next-problem, restore from a draft, etc.).
export function ComprehensionAnswerWidget({
  answerFormat,
  options,
  state,
  onSelectIndex,
  onChangeText,
  disabled,
  question,
}: {
  answerFormat: "multiple_choice" | "free_text";
  options: ReadonlyArray<string>;
  state: ComprehensionAnswerState;
  onSelectIndex: (idx: number) => void;
  onChangeText: (text: string) => void;
  disabled: boolean;
  question: string;
}) {
  return (
    <section
      data-testid="comprehension-answer-widget"
      aria-label="Comprehension answer"
      style={{
        display: "grid",
        gap: "0.6rem",
        padding: "0.75rem",
        border: "1px solid #ccc",
        borderRadius: 6,
        background: "#fafafa",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.4 }}>{question}</div>
      {answerFormat === "multiple_choice" ? (
        <fieldset style={{ display: "grid", gap: "0.4rem", border: "none", padding: 0 }}>
          <legend style={{ fontSize: 12, color: "#666" }}>Pick one</legend>
          {options.map((opt, i) => (
            <label
              key={i}
              data-testid={`comprehension-option-${i}`}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: 14,
                cursor: disabled ? "not-allowed" : "pointer",
                color: disabled ? "#999" : "#222",
              }}
            >
              <input
                type="radio"
                name="comprehension-answer"
                value={String(i)}
                checked={state.selected_index === i}
                onChange={() => onSelectIndex(i)}
                disabled={disabled}
                aria-label={`Option ${i + 1}: ${opt}`}
              />
              <span style={{ whiteSpace: "pre-wrap" }}>{opt}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <textarea
          data-testid="comprehension-free-text"
          aria-label="Free-text answer"
          value={state.free_text}
          onChange={(e) => onChangeText(e.target.value)}
          disabled={disabled}
          rows={4}
          placeholder="Type your answer in plain English."
          style={{
            width: "100%",
            padding: "0.5rem",
            fontSize: 14,
            fontFamily: "inherit",
            border: "1px solid #ccc",
            borderRadius: 4,
            resize: "vertical",
          }}
        />
      )}
    </section>
  );
}

// STORY-038 — comprehension grade-result panel. Replaces the GradeResultPanel for comprehension
// problems: no rubric bars (no code to grade) and no hidden-tests table (no tests). Just the
// pass/fail + the tutor's commentary which paraphrases the explanation in coach voice.
export function ComprehensionGradeResultPanel({
  correct,
  reasoning,
  explanation,
  fallbackUsed,
}: {
  correct: boolean;
  reasoning: string;
  explanation: string;
  fallbackUsed: boolean;
}) {
  return (
    <section
      data-testid="comprehension-grade-result"
      aria-label="Comprehension grade result"
      style={{
        display: "grid",
        gap: "0.6rem",
        padding: "0.75rem",
        border: "1px solid #ccc",
        borderRadius: 6,
        background: correct ? "#f1f8e9" : "#fff3e0",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16 }}>
        <StatusBadge variant={correct ? "pass" : "fail"}>
          {correct ? "Correct" : "Not quite"}
        </StatusBadge>
      </div>
      {correct ? (
        <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          Here is why: {explanation}
        </p>
      ) : (
        <>
          <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{reasoning}</p>
          <p
            style={{
              margin: 0,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              fontSize: 13,
              color: "#5d4037",
            }}
          >
            <strong>What good looks like: </strong>
            {explanation}
          </p>
        </>
      )}
      {fallbackUsed ? (
        <div style={{ fontSize: 12, color: "#999" }}>
          The grader could not produce a confident verdict; the answer above is conservative.
        </div>
      ) : null}
    </section>
  );
}

function humanizeArchetype(archetype: string): string {
  switch (archetype) {
    case "off_by_one":
      return "an off-by-one bug";
    case "mutation_in_iteration":
      return "a mutation-during-iteration bug";
    case "reference_equality":
      return "a reference-equality bug";
    case "async_race":
      return "an async race condition";
    case "late_binding":
      return "a closure late-binding bug";
    case "shadowing":
      return "a shadowed built-in";
    case "type_coercion":
      return "a type-coercion bug";
    case "default_arg_mutability":
      return "a mutable-default-arg bug";
    default:
      return "one bug";
  }
}

export function DifficultyBadge({ tier }: { tier: string }) {
  const p = difficultyBadgePalette(tier);
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

export function ErrorBanner({
  error,
  onDismiss,
  retryLabel,
}: {
  error: SessionError;
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
