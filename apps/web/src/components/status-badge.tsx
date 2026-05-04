import * as React from "react";
import type { ReactElement, ReactNode } from "react";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. Same workaround used elsewhere in apps/web (see dashboard-components.tsx).
void React;

// STORY-027 a11y: a tiny pass/fail (or warn/info) badge that conveys status via icon + text,
// never via colour alone. WCAG 1.4.1 — colour can't be the only channel for meaning. The icon
// is rendered as text inside an aria-hidden span (so screen readers don't announce it twice
// — the human-readable label is the source of truth).

export type StatusBadgeVariant = "pass" | "fail" | "warn" | "info";

interface VariantConfig {
  icon: string;
  bg: string;
  fg: string;
  border: string;
}

const VARIANT_STYLE: Record<StatusBadgeVariant, VariantConfig> = {
  pass: { icon: "✓", bg: "#e8f5e9", fg: "#1b5e20", border: "#a5d6a7" },
  fail: { icon: "✗", bg: "#ffebee", fg: "#b71c1c", border: "#ef9a9a" },
  warn: { icon: "⚠", bg: "#fff8e1", fg: "#7c4a03", border: "#ffe082" },
  info: { icon: "ℹ", bg: "#e3f2fd", fg: "#0d47a1", border: "#90caf9" },
};

export interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  children: ReactNode;
}

export function StatusBadge({ variant, children }: StatusBadgeProps): ReactElement {
  const v = VARIANT_STYLE[variant];
  return (
    <span
      data-status={variant}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.15rem 0.55rem",
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.border}`,
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.2,
      }}
    >
      <span aria-hidden="true">{v.icon}</span>
      <span>{children}</span>
    </span>
  );
}
