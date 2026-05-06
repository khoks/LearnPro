import type { SandboxRunChunk, SandboxRunResponse } from "./types.js";

// STORY-059 — pure chunker. Splits the run's stdout/stderr into newline-delimited tokens
// (one chunk per line, retaining a trailing-text remainder as a final line) and appends a
// single `exit` chunk. v1 fake-streams (Piston's HTTP API is request/response).
//
// Stateless on purpose — every call constructs a fresh array. Calling it twice with two
// different `SandboxRunResponse`s never leaks state between them.
export function chunksFromResponse(res: SandboxRunResponse): SandboxRunChunk[] {
  const chunks: SandboxRunChunk[] = [];
  for (const line of splitLines(res.stdout)) {
    chunks.push({ type: "stdout", line });
  }
  for (const line of splitLines(res.stderr)) {
    chunks.push({ type: "stderr", line });
  }
  chunks.push({
    type: "exit",
    exit_code: res.exit_code,
    duration_ms: res.duration_ms,
    killed_by: res.killed_by,
    language: res.language,
    ...(res.runtime_version !== undefined && { runtime_version: res.runtime_version }),
  });
  return chunks;
}

function splitLines(s: string): string[] {
  if (s.length === 0) return [];
  // Split on \n; keep empty intermediate segments so blank lines survive. Drop the trailing
  // empty segment that comes from a string ending in "\n" (otherwise every newline-terminated
  // program emits a phantom empty line).
  const parts = s.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

// STORY-059 — async-iterable adapter built on top of `chunksFromResponse()`. Used as the
// default impl of `SandboxProvider.runStream()`. Aborts cleanly when `signal` fires before
// or during the underlying `run()` call.
export async function* streamChunksFromRun(
  run: () => Promise<SandboxRunResponse>,
  signal?: AbortSignal,
): AsyncGenerator<SandboxRunChunk> {
  if (signal?.aborted) return;
  const res = await run();
  for (const chunk of chunksFromResponse(res)) {
    if (signal?.aborted) return;
    yield chunk;
  }
}
