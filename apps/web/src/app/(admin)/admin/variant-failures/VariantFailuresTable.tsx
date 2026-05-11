import * as React from "react";

void React;

// STORY-039e — Presentational table for failed-gate LLM-generated problem variants.
// Pure server-side rendering, no client state. Extracted so the page itself stays a
// thin server-component (auth + fetch + redirect) and the rendering can be unit-tested
// without mocking next/headers + next-auth.

export interface VariantFailureRow {
  id: string;
  source_problem_id: string;
  source_problem_slug: string | null;
  attempted_at: string;
  failure_reason: string;
  failure_detail: Record<string, unknown>;
  model_id: string;
  attempt_number: number;
}

export interface VariantFailuresTableProps {
  failures: VariantFailureRow[];
  total: number;
}

const reasonLabel: Record<string, string> = {
  parse_error: "Parse error",
  identity_mismatch: "Identity drift",
  spec_clarity_judge: "Spec clarity",
  self_validation: "Self-validation",
  retry_exhausted: "Retry exhausted",
};

export function formatReason(r: string): string {
  return reasonLabel[r] ?? r;
}

export function formatDetail(detail: Record<string, unknown>): string {
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString();
  } catch {
    return iso;
  }
}

export function VariantFailuresTable(props: VariantFailuresTableProps): React.ReactElement {
  return (
    <section aria-labelledby="variant-failures-heading">
      <h1 id="variant-failures-heading" style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
        Variant gate failures
      </h1>
      <p style={{ color: "#444", marginBottom: "1.5rem" }}>
        Read-only inspection of failed LLM-generated problem variants. Showing the most recent of{" "}
        {props.total} total.
      </p>
      {props.failures.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Source problem</th>
              <th style={{ padding: "0.5rem" }}>Reason</th>
              <th style={{ padding: "0.5rem" }}>Detail</th>
              <th style={{ padding: "0.5rem" }}>Model</th>
              <th style={{ padding: "0.5rem" }}>Attempt</th>
              <th style={{ padding: "0.5rem" }}>When</th>
            </tr>
          </thead>
          <tbody>
            {props.failures.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                <td style={{ padding: "0.5rem" }}>
                  <code style={{ fontSize: "0.8125rem" }}>
                    {row.source_problem_slug ?? row.source_problem_id}
                  </code>
                </td>
                <td style={{ padding: "0.5rem" }}>{formatReason(row.failure_reason)}</td>
                <td style={{ padding: "0.5rem" }}>
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "0.75rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxWidth: 400,
                    }}
                  >
                    {formatDetail(row.failure_detail)}
                  </pre>
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <code style={{ fontSize: "0.8125rem" }}>{row.model_id}</code>
                </td>
                <td style={{ padding: "0.5rem" }}>{row.attempt_number}</td>
                <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>
                  {formatTimestamp(row.attempted_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#666", padding: "1rem 0" }}>
          No variant gate failures recorded yet. When the LLM generator fails a structural,
          identity, self-validation, or spec-clarity check, the attempts will show up here.
        </p>
      )}
    </section>
  );
}
