import {
  SandboxRunChunkSchema,
  type SandboxRunChunk,
  type SandboxRunRequestInput,
} from "@learnpro/sandbox";

// STORY-059 — browser-side helper that subscribes to the SSE streaming sandbox endpoint and
// yields parsed chunks as they arrive. Uses fetch + ReadableStream reader (not EventSource —
// EventSource is GET-only and our endpoint is POST so the body shape stays identical to
// `/sandbox/run`).
//
// Yields validated `SandboxRunChunk` shapes; emits one synthetic `{ ok:false, error }`
// terminator on stream errors so the UI can render a single failure state without surfacing
// raw stream-protocol details.

export interface RunSandboxStreamOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export type StreamEvent =
  | { ok: true; chunk: SandboxRunChunk }
  | { ok: false; error: string; message?: string };

export async function* runSandboxStream(
  req: SandboxRunRequestInput,
  opts: RunSandboxStreamOptions = {},
): AsyncGenerator<StreamEvent> {
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f("/api/sandbox/run-stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      ...(opts.signal !== undefined && { signal: opts.signal }),
    });
  } catch (err) {
    yield {
      ok: false,
      error: "network_error",
      message: err instanceof Error ? err.message : String(err),
    };
    return;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error: string; message?: string }
      | null;
    yield {
      ok: false,
      error: body?.error ?? "request_failed",
      ...(body?.message !== undefined && { message: body.message }),
    };
    return;
  }

  if (res.body === null) {
    yield { ok: false, error: "empty_response" };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let blockEnd = buffer.indexOf("\n\n");
      while (blockEnd !== -1) {
        const block = buffer.slice(0, blockEnd);
        buffer = buffer.slice(blockEnd + 2);
        const parsed = parseSseBlock(block);
        if (parsed === null) {
          blockEnd = buffer.indexOf("\n\n");
          continue;
        }
        if (parsed.event === "error") {
          const e = parsed.data as { error?: string; message?: string };
          yield {
            ok: false,
            error: e.error ?? "stream_error",
            ...(e.message !== undefined && { message: e.message }),
          };
          return;
        }
        const validated = SandboxRunChunkSchema.safeParse(parsed.data);
        if (!validated.success) {
          yield { ok: false, error: "invalid_chunk", message: validated.error.message };
          return;
        }
        yield { ok: true, chunk: validated.data };
        if (validated.data.type === "exit") return;
        blockEnd = buffer.indexOf("\n\n");
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // releaseLock throws if the reader is already released — safe to ignore.
    }
  }
}

interface ParsedSseBlock {
  event: string;
  data: unknown;
}

function parseSseBlock(block: string): ParsedSseBlock | null {
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (event === null || dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}
