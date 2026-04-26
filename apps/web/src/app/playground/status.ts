import type { SandboxRunResponse } from "@learnpro/sandbox";
import type { RunSandboxResult } from "../../lib/run-sandbox";

export interface RunStatus {
  label: string;
  color: string;
}

export function statusFor(result: RunSandboxResult | null): RunStatus {
  if (result === null) return { label: "Idle", color: "#666" };
  if (!result.ok) return { label: `Error: ${result.error}`, color: "#c33" };
  return runResultStatus(result.result);
}

export function runResultStatus(res: SandboxRunResponse): RunStatus {
  if (res.killed_by !== null) return { label: `Killed (${res.killed_by})`, color: "#c33" };
  if (res.exit_code === 0) return { label: "OK", color: "#0a7" };
  return { label: `Exit ${res.exit_code ?? "?"}`, color: "#c33" };
}
