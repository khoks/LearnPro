import { describe, expect, it } from "vitest";
import { chunksFromResponse, streamChunksFromRun } from "./chunker.js";
import type { SandboxRunChunk, SandboxRunResponse } from "./types.js";

function baseResponse(over: Partial<SandboxRunResponse> = {}): SandboxRunResponse {
  return {
    stdout: "",
    stderr: "",
    exit_code: 0,
    duration_ms: 12,
    killed_by: null,
    language: "python",
    runtime_version: "3.10.0",
    ...over,
  };
}

describe("chunksFromResponse", () => {
  it("emits one stdout chunk per newline-terminated line", () => {
    const chunks = chunksFromResponse(baseResponse({ stdout: "a\nb\nc\n" }));
    expect(chunks.filter((c) => c.type === "stdout")).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: "stdout", line: "a" });
    expect(chunks[1]).toEqual({ type: "stdout", line: "b" });
    expect(chunks[2]).toEqual({ type: "stdout", line: "c" });
  });

  it("preserves a trailing line that has no newline", () => {
    const chunks = chunksFromResponse(baseResponse({ stdout: "first\nlast" }));
    expect(chunks.filter((c) => c.type === "stdout").map((c) => c.line)).toEqual([
      "first",
      "last",
    ]);
  });

  it("preserves blank intermediate lines", () => {
    const chunks = chunksFromResponse(baseResponse({ stdout: "a\n\nb\n" }));
    expect(chunks.filter((c) => c.type === "stdout").map((c) => c.line)).toEqual(["a", "", "b"]);
  });

  it("emits stderr chunks after stdout chunks", () => {
    const chunks = chunksFromResponse(baseResponse({ stdout: "ok\n", stderr: "warn\n" }));
    expect(chunks[0]).toEqual({ type: "stdout", line: "ok" });
    expect(chunks[1]).toEqual({ type: "stderr", line: "warn" });
  });

  it("always ends with exactly one exit chunk carrying the run metadata", () => {
    const chunks = chunksFromResponse(
      baseResponse({
        stdout: "hi\n",
        exit_code: 42,
        duration_ms: 3_400,
        killed_by: "timeout",
        language: "typescript",
        runtime_version: "5.0.3",
      }),
    );
    const exits = chunks.filter((c) => c.type === "exit");
    expect(exits).toHaveLength(1);
    const exit = exits[0]!;
    if (exit.type !== "exit") throw new Error("not an exit chunk");
    expect(exit.exit_code).toBe(42);
    expect(exit.duration_ms).toBe(3_400);
    expect(exit.killed_by).toBe("timeout");
    expect(exit.language).toBe("typescript");
    expect(exit.runtime_version).toBe("5.0.3");
    expect(chunks[chunks.length - 1]).toBe(exit);
  });

  it("emits exit even when both streams are empty", () => {
    const chunks = chunksFromResponse(baseResponse());
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.type).toBe("exit");
  });

  it("omits runtime_version from the exit chunk when undefined", () => {
    const r = baseResponse();
    delete (r as { runtime_version?: string }).runtime_version;
    const chunks = chunksFromResponse(r);
    const exit = chunks[chunks.length - 1]!;
    if (exit.type !== "exit") throw new Error("not an exit chunk");
    expect("runtime_version" in exit).toBe(false);
  });

  // STORY-059 hardening parity AC — the chunker is the only newly added pure function in the
  // streaming code path. STORY-010's existing breakout suite covers the underlying
  // `run()`-level guarantees; this asserts the chunker itself doesn't leak state across
  // calls.
  it("is stateless — two back-to-back calls return independent arrays with no cross-talk", () => {
    const a = chunksFromResponse(baseResponse({ stdout: "alpha\n" }));
    const b = chunksFromResponse(baseResponse({ stdout: "beta\n", stderr: "boom\n" }));
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(3);
    expect(a.find((c) => c.type === "stdout" && c.line === "beta")).toBeUndefined();
    expect(b.find((c) => c.type === "stdout" && c.line === "alpha")).toBeUndefined();
    // Mutating one array must not touch the other.
    a.length = 0;
    expect(b).toHaveLength(3);
  });
});

describe("streamChunksFromRun", () => {
  async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const v of it) out.push(v);
    return out;
  }

  it("yields chunks in the same order as chunksFromResponse for a successful run", async () => {
    const res = baseResponse({ stdout: "one\ntwo\n", stderr: "warn\n" });
    const chunks = await collect(streamChunksFromRun(async () => res));
    expect(chunks).toEqual(chunksFromResponse(res));
  });

  it("calls the run() callback exactly once per stream", async () => {
    let calls = 0;
    const stream = streamChunksFromRun(async () => {
      calls++;
      return baseResponse({ stdout: "x\n" });
    });
    await collect(stream);
    expect(calls).toBe(1);
  });

  it("returns nothing when the abort signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    let called = false;
    const chunks = await collect(
      streamChunksFromRun(async () => {
        called = true;
        return baseResponse({ stdout: "x\n" });
      }, ctrl.signal),
    );
    expect(chunks).toHaveLength(0);
    expect(called).toBe(false);
  });

  it("stops yielding mid-stream when the abort signal fires after run() resolves", async () => {
    const ctrl = new AbortController();
    const chunks: SandboxRunChunk[] = [];
    for await (const c of streamChunksFromRun(
      async () => baseResponse({ stdout: "a\nb\nc\n" }),
      ctrl.signal,
    )) {
      chunks.push(c);
      if (c.type === "stdout" && c.line === "a") ctrl.abort();
    }
    expect(chunks).toEqual([{ type: "stdout", line: "a" }]);
  });

  it("propagates the underlying run() error", async () => {
    const stream = streamChunksFromRun(async () => {
      throw new Error("boom");
    });
    await expect(collect(stream)).rejects.toThrow("boom");
  });
});
