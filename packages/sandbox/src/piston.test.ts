import { describe, expect, it } from "vitest";
import {
  DEFAULT_PISTON_LANGUAGES,
  PistonSandboxProvider,
  type PistonExecuteParams,
  type PistonExecuteResponse,
  type PistonTransport,
} from "./piston.js";
import { InMemorySandboxTelemetrySink } from "./telemetry.js";
import { SandboxRequestError } from "./errors.js";
import { ENTRY_FILE_BY_LANGUAGE, SandboxRunRequestSchema } from "./types.js";

class FakePistonTransport implements PistonTransport {
  public lastParams: PistonExecuteParams | null = null;
  public calls = 0;

  constructor(
    private readonly response:
      | PistonExecuteResponse
      | ((p: PistonExecuteParams) => PistonExecuteResponse)
      | Error,
  ) {}

  async execute(params: PistonExecuteParams): Promise<PistonExecuteResponse> {
    this.lastParams = params;
    this.calls++;
    if (this.response instanceof Error) throw this.response;
    return typeof this.response === "function" ? this.response(params) : this.response;
  }
}

function ok(
  over: Partial<PistonExecuteResponse["run"]> = {},
  version = "3.10.0",
): PistonExecuteResponse {
  return {
    language: "python",
    version,
    run: { stdout: "", stderr: "", code: 0, signal: null, ...over },
  };
}

describe("PistonSandboxProvider.run — happy path", () => {
  it("runs python and returns stdout", async () => {
    const transport = new FakePistonTransport(ok({ stdout: "hello\n" }));
    const provider = new PistonSandboxProvider({ transport });
    const res = await provider.run({
      language: "python",
      code: "print('hello')",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(res.stdout).toBe("hello\n");
    expect(res.exit_code).toBe(0);
    expect(res.killed_by).toBeNull();
    expect(res.language).toBe("python");
    expect(res.runtime_version).toBe("3.10.0");
  });

  it("forwards stdin to Piston when provided", async () => {
    const transport = new FakePistonTransport(ok({ stdout: "got: hi" }));
    const provider = new PistonSandboxProvider({ transport });
    await provider.run({
      language: "python",
      code: "import sys; print('got:', sys.stdin.read())",
      stdin: "hi",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(transport.lastParams?.stdin).toBe("hi");
  });

  it("maps the python language spec correctly", async () => {
    const transport = new FakePistonTransport(ok());
    const provider = new PistonSandboxProvider({ transport });
    await provider.run({
      language: "python",
      code: "x = 1",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(transport.lastParams?.language).toBe(DEFAULT_PISTON_LANGUAGES.python.pistonLanguage);
    expect(transport.lastParams?.version).toBe(DEFAULT_PISTON_LANGUAGES.python.pistonVersion);
    expect(transport.lastParams?.files[0]?.name).toBe(DEFAULT_PISTON_LANGUAGES.python.filename);
  });

  it("converts memory_limit_mb to bytes when calling Piston", async () => {
    const transport = new FakePistonTransport(ok());
    const provider = new PistonSandboxProvider({ transport });
    await provider.run({
      language: "python",
      code: "x = 1",
      time_limit_ms: 5_000,
      memory_limit_mb: 256,
      output_limit_bytes: 64 * 1024,
    });
    expect(transport.lastParams?.run_memory_limit).toBe(256 * 1024 * 1024);
    expect(transport.lastParams?.run_timeout).toBe(5_000);
  });

  it("runs typescript and routes to the typescript language spec (STORY-008)", async () => {
    const transport = new FakePistonTransport(
      ok({ stdout: "hello\n" }, DEFAULT_PISTON_LANGUAGES.typescript.pistonVersion),
    );
    const provider = new PistonSandboxProvider({ transport });
    const res = await provider.run({
      language: "typescript",
      code: "console.log('hello')",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(transport.lastParams?.language).toBe(DEFAULT_PISTON_LANGUAGES.typescript.pistonLanguage);
    expect(transport.lastParams?.version).toBe(DEFAULT_PISTON_LANGUAGES.typescript.pistonVersion);
    expect(transport.lastParams?.files[0]?.name).toBe(DEFAULT_PISTON_LANGUAGES.typescript.filename);
    expect(res.stdout).toBe("hello\n");
    expect(res.language).toBe("typescript");
    expect(res.runtime_version).toBe(DEFAULT_PISTON_LANGUAGES.typescript.pistonVersion);
    expect(res.killed_by).toBeNull();
  });

  it("classifies typescript timeout the same way as python (STORY-008)", async () => {
    const transport = new FakePistonTransport(
      ok(
        { stdout: "", stderr: "", code: null, signal: "SIGKILL", message: "Run timed out" },
        DEFAULT_PISTON_LANGUAGES.typescript.pistonVersion,
      ),
    );
    const provider = new PistonSandboxProvider({ transport });
    const res = await provider.run({
      language: "typescript",
      code: "while(true){}",
      time_limit_ms: 1_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(res.killed_by).toBe("timeout");
    expect(res.language).toBe("typescript");
  });
});

describe("PistonSandboxProvider.run — failure classification", () => {
  it("classifies wall-clock timeout as killed_by=timeout", async () => {
    const transport = new FakePistonTransport(
      ok({ stdout: "", stderr: "", code: null, signal: "SIGKILL", message: "Run timed out" }),
    );
    const provider = new PistonSandboxProvider({ transport });
    const res = await provider.run({
      language: "python",
      code: "while True: pass",
      time_limit_ms: 1_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(res.killed_by).toBe("timeout");
    expect(res.exit_code).toBeNull();
  });

  it("classifies OOM as killed_by=memory", async () => {
    const transport = new FakePistonTransport(
      ok({ stdout: "", stderr: "MemoryError", code: null, signal: "SIGKILL", message: "OOM" }),
    );
    const provider = new PistonSandboxProvider({ transport });
    const res = await provider.run({
      language: "python",
      code: "bytearray(1<<30)",
      time_limit_ms: 5_000,
      memory_limit_mb: 16,
      output_limit_bytes: 64 * 1024,
    });
    expect(res.killed_by).toBe("memory");
  });

  it("truncates stdout exceeding output_limit_bytes and reports killed_by=output-limit", async () => {
    const huge = "x".repeat(200_000);
    const transport = new FakePistonTransport(ok({ stdout: huge }));
    const provider = new PistonSandboxProvider({ transport });
    const res = await provider.run({
      language: "python",
      code: "print('x' * 10**8)",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 1_024,
    });
    expect(res.killed_by).toBe("output-limit");
    expect(res.stdout.length).toBeLessThanOrEqual(1_024);
    expect(res.stdout.endsWith("[truncated]")).toBe(true);
  });

  it("reports killed_by=signal when Piston returns a non-OOM/non-timeout signal", async () => {
    const transport = new FakePistonTransport(ok({ code: null, signal: "SIGSEGV" }));
    const provider = new PistonSandboxProvider({ transport });
    const res = await provider.run({
      language: "python",
      code: "import ctypes; ctypes.string_at(0)",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(res.killed_by).toBe("signal");
  });

  it("returns killed_by=null when the program exits cleanly with non-zero exit code", async () => {
    const transport = new FakePistonTransport(ok({ stderr: "boom", code: 1 }));
    const provider = new PistonSandboxProvider({ transport });
    const res = await provider.run({
      language: "python",
      code: "import sys; sys.exit(1)",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(res.exit_code).toBe(1);
    expect(res.killed_by).toBeNull();
  });
});

describe("PistonSandboxProvider.run — errors", () => {
  it("wraps transport failures as SandboxRequestError", async () => {
    const transport = new FakePistonTransport(new Error("connect ECONNREFUSED"));
    const provider = new PistonSandboxProvider({ transport });
    await expect(
      provider.run({
        language: "python",
        code: "print(1)",
        time_limit_ms: 5_000,
        memory_limit_mb: 128,
        output_limit_bytes: 64 * 1024,
      }),
    ).rejects.toBeInstanceOf(SandboxRequestError);
  });

  it("rejects empty code via zod boundary", async () => {
    const transport = new FakePistonTransport(ok());
    const provider = new PistonSandboxProvider({ transport });
    await expect(
      provider.run({
        language: "python",
        code: "",
        time_limit_ms: 5_000,
        memory_limit_mb: 128,
        output_limit_bytes: 64 * 1024,
      }),
    ).rejects.toThrow();
  });
});

describe("PistonSandboxProvider.runStream — STORY-059", () => {
  it("yields stdout/stderr chunks ending with an exit chunk", async () => {
    const transport = new FakePistonTransport(ok({ stdout: "a\nb\n", stderr: "oops\n" }));
    const provider = new PistonSandboxProvider({ transport });
    const out = [];
    for await (const c of provider.runStream({
      language: "python",
      code: "print('a'); print('b')",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    })) {
      out.push(c);
    }
    expect(out.map((c) => c.type)).toEqual(["stdout", "stdout", "stderr", "exit"]);
    expect(transport.calls).toBe(1);
    const last = out[out.length - 1]!;
    if (last.type !== "exit") throw new Error("expected exit chunk");
    expect(last.exit_code).toBe(0);
    expect(last.language).toBe("python");
  });

  it("emits telemetry exactly once per stream (telemetry is on the underlying run())", async () => {
    const sink = new InMemorySandboxTelemetrySink();
    const transport = new FakePistonTransport(ok({ stdout: "hello\n" }));
    const provider = new PistonSandboxProvider({ transport, telemetry: sink });
    const stream = provider.runStream({
      language: "python",
      code: "print('hello')",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    for await (const _ of stream) {
      // drain
      void _;
    }
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.ok).toBe(true);
  });
});

// STORY-043 — Multi-file workspace tests.  The legacy `code` shorthand keeps working;
// the multi-file `files` shape ships every file to Piston, with the entry file at index 0
// (Piston runs the first file in its files[] array by default).  Both shapes are accepted
// by the same `SandboxRunRequestSchema` thanks to a `code: string` → `files[]` preprocess.
describe("PistonSandboxProvider.run — STORY-043 multi-file workspace", () => {
  it("ships multi-file workspaces to Piston with the entry file first", async () => {
    const transport = new FakePistonTransport(ok({ stdout: "two\n" }));
    const provider = new PistonSandboxProvider({ transport });
    await provider.run({
      language: "python",
      files: [
        { path: "lib/util.py", content: "def add(a, b): return a + b\n" },
        { path: "main.py", content: "from lib.util import add\nprint(add(1, 1))\n" },
      ],
      entry_file: "main.py",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(transport.lastParams?.files).toHaveLength(2);
    // Entry first.
    expect(transport.lastParams?.files[0]?.name).toBe("main.py");
    expect(transport.lastParams?.files[1]?.name).toBe("lib/util.py");
  });

  it("falls back to the per-language entry filename when entry_file is omitted", async () => {
    const transport = new FakePistonTransport(ok());
    const provider = new PistonSandboxProvider({ transport });
    await provider.run({
      language: "typescript",
      files: [
        { path: "math.ts", content: "export const sum = (a: number, b: number) => a + b;\n" },
        {
          path: "index.ts",
          content: "import { sum } from './math.js';\nconsole.log(sum(2, 3));\n",
        },
      ],
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    // The TS spec's filename is `index.ts` (per ENTRY_FILE_BY_LANGUAGE), so we expect the
    // entry to be reordered to the front.
    expect(ENTRY_FILE_BY_LANGUAGE.typescript).toBe("index.ts");
    expect(transport.lastParams?.files[0]?.name).toBe("index.ts");
  });

  it("preserves the order of non-entry files", async () => {
    const transport = new FakePistonTransport(ok());
    const provider = new PistonSandboxProvider({ transport });
    await provider.run({
      language: "python",
      files: [
        { path: "a.py", content: "x = 1\n" },
        { path: "b.py", content: "y = 2\n" },
        { path: "main.py", content: "import a, b\nprint(a.x + b.y)\n" },
        { path: "c.py", content: "z = 3\n" },
      ],
      entry_file: "main.py",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    const names = transport.lastParams?.files.map((f) => f.name);
    expect(names).toEqual(["main.py", "a.py", "b.py", "c.py"]);
  });

  it("accepts the legacy `code` shorthand (backward compat)", async () => {
    const transport = new FakePistonTransport(ok({ stdout: "ok\n" }));
    const provider = new PistonSandboxProvider({ transport });
    const res = await provider.run({
      language: "python",
      code: "print('ok')\n",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(transport.lastParams?.files).toHaveLength(1);
    expect(transport.lastParams?.files[0]?.name).toBe(ENTRY_FILE_BY_LANGUAGE.python);
    expect(transport.lastParams?.files[0]?.content).toBe("print('ok')\n");
    expect(res.stdout).toBe("ok\n");
  });

  it("rejects duplicate paths in files[] via the zod boundary", () => {
    const result = SandboxRunRequestSchema.safeParse({
      language: "python",
      files: [
        { path: "main.py", content: "x=1\n" },
        { path: "main.py", content: "x=2\n" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects entry_file values not present in files[]", () => {
    const result = SandboxRunRequestSchema.safeParse({
      language: "python",
      files: [{ path: "main.py", content: "x=1\n" }],
      entry_file: "missing.py",
    });
    expect(result.success).toBe(false);
  });

  it("rejects path traversal (..-segments)", () => {
    const result = SandboxRunRequestSchema.safeParse({
      language: "python",
      files: [{ path: "../etc/passwd", content: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects absolute paths", () => {
    const result = SandboxRunRequestSchema.safeParse({
      language: "python",
      files: [{ path: "/etc/passwd", content: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("permits empty content in non-entry files (e.g. an empty __init__.py)", async () => {
    const transport = new FakePistonTransport(ok({ stdout: "ok\n" }));
    const provider = new PistonSandboxProvider({ transport });
    await provider.run({
      language: "python",
      files: [
        { path: "lib/__init__.py", content: "" },
        { path: "lib/util.py", content: "def f(): return 1\n" },
        { path: "main.py", content: "from lib.util import f\nprint(f())\n" },
      ],
      entry_file: "main.py",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(transport.lastParams?.files.find((f) => f.name === "lib/__init__.py")?.content).toBe(
      "",
    );
  });
});

describe("PistonSandboxProvider — telemetry", () => {
  it("emits a sandbox telemetry event on success", async () => {
    const sink = new InMemorySandboxTelemetrySink();
    const transport = new FakePistonTransport(ok({ stdout: "hello\n" }));
    const provider = new PistonSandboxProvider({ transport, telemetry: sink });
    await provider.run({
      language: "python",
      code: "print('hello')",
      time_limit_ms: 5_000,
      memory_limit_mb: 128,
      output_limit_bytes: 64 * 1024,
    });
    expect(sink.events).toHaveLength(1);
    const ev = sink.events[0]!;
    expect(ev.provider).toBe("piston");
    expect(ev.language).toBe("python");
    expect(ev.ok).toBe(true);
    expect(ev.killed_by).toBeNull();
    expect(ev.stdout_bytes).toBe("hello\n".length);
  });

  it("emits a telemetry event with ok=false on transport failure", async () => {
    const sink = new InMemorySandboxTelemetrySink();
    const transport = new FakePistonTransport(new Error("boom"));
    const provider = new PistonSandboxProvider({ transport, telemetry: sink });
    await expect(
      provider.run({
        language: "python",
        code: "print(1)",
        time_limit_ms: 5_000,
        memory_limit_mb: 128,
        output_limit_bytes: 64 * 1024,
      }),
    ).rejects.toBeInstanceOf(SandboxRequestError);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]?.ok).toBe(false);
  });
});
