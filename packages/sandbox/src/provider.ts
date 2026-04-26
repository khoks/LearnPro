import type { SandboxRunRequest, SandboxRunResponse } from "./types.js";

export interface SandboxProvider {
  readonly name: string;
  run(req: SandboxRunRequest): Promise<SandboxRunResponse>;
}
