import type { SandboxRunResponse } from "@learnpro/sandbox";
import type { RunSandboxResult } from "../../lib/run-sandbox";

export type RunStatusTone = "idle" | "pass" | "fail";

export interface RunStatus {
  label: string;
  color: string;
  tone: RunStatusTone;
}

export function statusFor(result: RunSandboxResult | null): RunStatus {
  if (result === null) return { label: "Idle", color: "#666", tone: "idle" };
  if (!result.ok) return { label: `Error: ${result.error}`, color: "#c33", tone: "fail" };
  return runResultStatus(result.result);
}

export function runResultStatus(res: SandboxRunResponse): RunStatus {
  if (res.killed_by !== null)
    return { label: `Killed (${res.killed_by})`, color: "#c33", tone: "fail" };
  if (res.exit_code === 0) return { label: "OK", color: "#0a7", tone: "pass" };
  return { label: `Exit ${res.exit_code ?? "?"}`, color: "#c33", tone: "fail" };
}
