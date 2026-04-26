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
