import type { SandboxRunChunk, SandboxRunRequestInput, SandboxRunResponse } from "./types.js";

export interface SandboxProvider {
  readonly name: string;
  // STORY-043 — accepts both shapes via `SandboxRunRequestInput`: the legacy `{ language, code }`
  // shorthand and the multi-file `{ language, files, entry_file? }` shape.  Implementations
  // re-parse via `SandboxRunRequestSchema` so the post-parse value is always the multi-file form.
  run(req: SandboxRunRequestInput): Promise<SandboxRunResponse>;
  // STORY-059 — streaming variant. Default impl in `streamChunksFromResponse()` chunks the
  // request/response output into newline-delimited tokens. Long-term (STORY-048) a future
  // provider may stream natively; the contract stays the same.
  runStream(req: SandboxRunRequestInput, signal?: AbortSignal): AsyncIterable<SandboxRunChunk>;
}
