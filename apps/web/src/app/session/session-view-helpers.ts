import type { FinalOutcome } from "@learnpro/agent";

// Pure render helpers extracted from SessionClient so they can be unit-tested without a DOM
// or RTL setup. The components in session-view.tsx are dumb wrappers around these.

export function rubricBarColor(value: number): string {
  if (value >= 0.8) return "#2e7d32";
  if (value >= 0.5) return "#f9a825";
  return "#c62828";
}

export function rubricPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 100;
  return Math.round(value * 100);
}

export function humanizeOutcome(o: FinalOutcome): string {
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

export function formatExpectedGot(expected: unknown, got: unknown): string {
  if (expected === undefined && got === undefined) return "mismatch";
  return `expected=${JSON.stringify(expected)} got=${JSON.stringify(got)}`;
}

export function skillDeltaArrow(delta: number): "up" | "down" | "flat" {
  if (delta > 0.0001) return "up";
  if (delta < -0.0001) return "down";
  return "flat";
}

export function skillDeltaSymbol(arrow: "up" | "down" | "flat"): string {
  if (arrow === "up") return "↑";
  if (arrow === "down") return "↓";
  return "→";
}

export function difficultyBadgePalette(tier: string): { bg: string; fg: string } {
  switch (tier) {
    case "easy":
      return { bg: "#e8f5e9", fg: "#1b5e20" };
    case "medium":
      return { bg: "#fff8e1", fg: "#827717" };
    case "hard":
      return { bg: "#ffe0b2", fg: "#bf360c" };
    case "expert":
      return { bg: "#ffebee", fg: "#b71c1c" };
    default:
      return { bg: "#eee", fg: "#333" };
  }
}
