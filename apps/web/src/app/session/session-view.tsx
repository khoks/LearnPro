"use client";

import type { FinalOutcome, GradeOutput, UpdateProfileOutput } from "@learnpro/agent";
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
        time: {Math.round(profile.time_to_solve_ms / 1000)}s · attempts: {profile.attempts} ·
        hints: {profile.hints_used}
      </div>
      {profile.skill_updates.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.3rem" }}>
          {profile.skill_updates.map((u) => {
            const arrow = skillDeltaArrow(u.next_skill - u.prev_skill);
            const tone =
              arrow === "up" ? "#1b5e20" : arrow === "down" ? "#c62828" : "#666";
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
      <div
        style={{ fontWeight: 700, fontSize: 16, color: grade.passed ? "#1b5e20" : "#bf360c" }}
      >
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
