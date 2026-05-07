import { streamChunksFromRun } from "./chunker.js";
import { SandboxLanguageNotSupportedError, SandboxRequestError } from "./errors.js";
import type { SandboxProvider } from "./provider.js";
import { NullSandboxTelemetrySink } from "./telemetry.js";
import {
  ENTRY_FILE_BY_LANGUAGE,
  SandboxRunRequestSchema,
  type SandboxKilledBy,
  type SandboxLanguage,
  type SandboxRunChunk,
  type SandboxRunRequestInput,
  type SandboxRunResponse,
  type SandboxTelemetrySink,
  type SandboxWorkspaceFile,
} from "./types.js";

export interface PistonExecuteParams {
  language: string;
  version: string;
  files: Array<{ name: string; content: string }>;
  // Piston runs the first file by default, but multi-file workspaces need an explicit entry
  // (Piston's `args` map their `compile`/`run` step to a specific file).  We reorder `files`
  // so the entry is the FIRST element — that's the cross-version-compatible way to pin the
  // entry point, since Piston versions differ on whether they honour `entry_file` at all.
  stdin?: string;
  run_timeout?: number;
  run_memory_limit?: number;
}

export interface PistonExecuteResponse {
  language: string;
  version: string;
  run: {
    stdout: string;
    stderr: string;
    output?: string;
    code: number | null;
    signal: string | null;
    message?: string;
  };
  compile?: {
    stdout: string;
    stderr: string;
    output?: string;
    code: number | null;
    signal: string | null;
    message?: string;
  };
}

export interface PistonTransport {
  execute(params: PistonExecuteParams): Promise<PistonExecuteResponse>;
}

export interface PistonLanguageSpec {
  pistonLanguage: string;
  pistonVersion: string;
  filename: string;
}

// STORY-043 — `filename` is the per-language entry-file convention.  Single-file requests
// (legacy `code` shorthand) get this filename; multi-file requests pin their own entry via
// `entry_file` in the request.  Adding a language?  Update ENTRY_FILE_BY_LANGUAGE in types.ts
// in the same commit so the two stay in sync.
export const DEFAULT_PISTON_LANGUAGES: Record<SandboxLanguage, PistonLanguageSpec> = {
  python: {
    pistonLanguage: "python",
    pistonVersion: "3.10.0",
    filename: ENTRY_FILE_BY_LANGUAGE.python,
  },
  typescript: {
    pistonLanguage: "typescript",
    pistonVersion: "5.0.3",
    filename: ENTRY_FILE_BY_LANGUAGE.typescript,
  },
};

export interface PistonSandboxProviderOptions {
  transport: PistonTransport;
  languages?: Partial<Record<SandboxLanguage, PistonLanguageSpec>>;
  telemetry?: SandboxTelemetrySink;
  now?: () => number;
}

export class PistonSandboxProvider implements SandboxProvider {
  readonly name = "piston";

  private readonly transport: PistonTransport;
  private readonly languages: Record<SandboxLanguage, PistonLanguageSpec>;
  private readonly telemetry: SandboxTelemetrySink;
  private readonly now: () => number;

  constructor(opts: PistonSandboxProviderOptions) {
    this.transport = opts.transport;
    this.languages = { ...DEFAULT_PISTON_LANGUAGES, ...(opts.languages ?? {}) };
    this.telemetry = opts.telemetry ?? new NullSandboxTelemetrySink();
    this.now = opts.now ?? (() => Date.now());
  }

  // STORY-059 — streaming variant. Calls `run()` once (Piston is request/response) and
  // re-emits the result as newline-delimited chunks via the shared `streamChunksFromRun`
  // helper. Telemetry is emitted exactly once (inside the underlying `run()`).
  runStream(req: SandboxRunRequestInput, signal?: AbortSignal): AsyncIterable<SandboxRunChunk> {
    return streamChunksFromRun(() => this.run(req), signal);
  }

  async run(rawReq: SandboxRunRequestInput): Promise<SandboxRunResponse> {
    const req = SandboxRunRequestSchema.parse(rawReq);
    const spec = this.languages[req.language];
    if (!spec) {
      throw new SandboxLanguageNotSupportedError(this.name, req.language);
    }
    const start = this.now();
    // STORY-043 — multi-file workspace.  The entry file is the one named by
    // `req.entry_file`, falling back to the per-language convention.  We reorder so the
    // entry is first (Piston runs the first file by default) and ship every other file
    // alongside, allowing native module resolution: Python's `import` resolves from the
    // working dir, and ts-node-style runners pick up sibling .ts files via relative imports.
    const entryName = req.entry_file ?? spec.filename;
    const orderedFiles = orderEntryFirst(req.files, entryName);
    const params: PistonExecuteParams = {
      language: spec.pistonLanguage,
      version: spec.pistonVersion,
      files: orderedFiles.map((f) => ({ name: f.path, content: f.content })),
      run_timeout: req.time_limit_ms,
      run_memory_limit: req.memory_limit_mb * 1024 * 1024,
    };
    if (req.stdin !== undefined) params.stdin = req.stdin;
    let res: PistonExecuteResponse;
    try {
      res = await this.transport.execute(params);
    } catch (err) {
      this.recordTelemetry({
        language: req.language,
        start,
        ok: false,
        stdout: "",
        stderr: "",
        exit_code: null,
        killed_by: null,
      });
      throw new SandboxRequestError("Piston execute failed", this.name, err);
    }

    const stdoutRaw = res.run.stdout ?? "";
    const stderrRaw = res.run.stderr ?? "";
    const limit = req.output_limit_bytes;
    const stdoutTruncated = truncateBytes(stdoutRaw, limit);
    const stderrTruncated = truncateBytes(stderrRaw, limit);
    const totalRawBytes = byteLength(stdoutRaw) + byteLength(stderrRaw);

    const killed_by = classifyKilledBy({
      pistonSignal: res.run.signal,
      pistonMessage: res.run.message,
      pistonCode: res.run.code,
      truncated: stdoutTruncated.truncated || stderrTruncated.truncated,
      requestedTimeoutMs: req.time_limit_ms,
      durationMs: this.now() - start,
      totalRawBytes,
      outputLimit: limit,
    });

    const out: SandboxRunResponse = {
      stdout: stdoutTruncated.value,
      stderr: stderrTruncated.value,
      exit_code: res.run.code,
      duration_ms: Math.max(0, this.now() - start),
      killed_by,
      language: req.language,
      runtime_version: res.version,
    };
    this.recordTelemetry({
      language: req.language,
      start,
      ok: true,
      stdout: out.stdout,
      stderr: out.stderr,
      exit_code: out.exit_code,
      killed_by: out.killed_by,
    });
    return out;
  }

  private recordTelemetry(opts: {
    language: SandboxLanguage;
    start: number;
    ok: boolean;
    stdout: string;
    stderr: string;
    exit_code: number | null;
    killed_by: SandboxKilledBy | null;
  }): void {
    this.telemetry.record({
      provider: this.name,
      language: opts.language,
      duration_ms: Math.max(0, this.now() - opts.start),
      killed_by: opts.killed_by,
      exit_code: opts.exit_code,
      stdout_bytes: byteLength(opts.stdout),
      stderr_bytes: byteLength(opts.stderr),
      ok: opts.ok,
      decided_at: new Date(this.now()).toISOString(),
    });
  }
}

interface TruncationResult {
  value: string;
  truncated: boolean;
}

const TRUNCATION_MARKER = "\n[truncated]";

function truncateBytes(s: string, limit: number): TruncationResult {
  const enc = new TextEncoder();
  const bytes = enc.encode(s);
  if (bytes.length <= limit) return { value: s, truncated: false };
  const head = bytes.slice(0, Math.max(0, limit - TRUNCATION_MARKER.length));
  const dec = new TextDecoder("utf-8", { fatal: false });
  return { value: `${dec.decode(head)}${TRUNCATION_MARKER}`, truncated: true };
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

interface ClassifyArgs {
  pistonSignal: string | null;
  pistonMessage: string | undefined;
  pistonCode: number | null;
  truncated: boolean;
  requestedTimeoutMs: number;
  durationMs: number;
  totalRawBytes: number;
  outputLimit: number;
}

// STORY-043 — Piston runs the first file by default.  Reorder so the entry file is at index
// 0 if it isn't already; non-entry files keep their original order so authors can rely on a
// stable layout for their workspace YAML.  When the entry isn't found we ship the files
// untouched (validation already rejects entry_file values not in files[]).
function orderEntryFirst(
  files: ReadonlyArray<SandboxWorkspaceFile>,
  entryPath: string,
): ReadonlyArray<SandboxWorkspaceFile> {
  const entryIdx = files.findIndex((f) => f.path === entryPath);
  if (entryIdx <= 0) return files;
  const rest = files.filter((_, i) => i !== entryIdx);
  return [files[entryIdx]!, ...rest];
}

function classifyKilledBy(a: ClassifyArgs): SandboxKilledBy | null {
  if (a.totalRawBytes > a.outputLimit) return "output-limit";
  if (a.truncated) return "output-limit";
  const msg = (a.pistonMessage ?? "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (a.pistonSignal === "SIGKILL" && a.durationMs >= a.requestedTimeoutMs) return "timeout";
  if (msg.includes("memory") || msg.includes("oom")) return "memory";
  if (a.pistonSignal === "SIGKILL") return "memory";
  if (a.pistonSignal !== null) return "signal";
  return null;
}
