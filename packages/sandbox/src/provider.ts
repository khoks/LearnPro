import type { SandboxRunChunk, SandboxRunRequest, SandboxRunResponse } from "./types.js";

export interface SandboxProvider {
  readonly name: string;
  run(req: SandboxRunRequest): Promise<SandboxRunResponse>;
  // STORY-059 — streaming variant. Default impl in `streamChunksFromResponse()` chunks the
  // request/response output into newline-delimited tokens. Long-term (STORY-048) a future
  // provider may stream natively; the contract stays the same.
  runStream(req: SandboxRunRequest, signal?: AbortSignal): AsyncIterable<SandboxRunChunk>;
}
