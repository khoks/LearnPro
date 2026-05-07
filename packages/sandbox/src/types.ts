import { z } from "zod";

export const SandboxLanguageSchema = z.enum(["python", "typescript"]);
export type SandboxLanguage = z.infer<typeof SandboxLanguageSchema>;

export const SandboxKilledBySchema = z.enum(["timeout", "memory", "output-limit", "signal"]);
export type SandboxKilledBy = z.infer<typeof SandboxKilledBySchema>;

export const DEFAULT_TIME_LIMIT_MS = 5_000;
export const DEFAULT_MEMORY_LIMIT_MB = 128;
export const DEFAULT_OUTPUT_LIMIT_BYTES = 64 * 1024;

// STORY-043 — multi-file workspaces. Per-language entry-point convention used both as the
// default filename when a single-file `code` shorthand is supplied AND as Piston's
// `entry_file` selection rule. Adding a language? Add it here AND to DEFAULT_PISTON_LANGUAGES.
export const ENTRY_FILE_BY_LANGUAGE: Readonly<Record<SandboxLanguage, string>> = {
  python: "main.py",
  typescript: "index.ts",
};

// STORY-043 — multi-file workspace file. `path` is a forward-slash-relative POSIX path under
// the workspace root (e.g. `main.py`, `lib/util.py`); leading slashes / `..` are rejected so
// every file lands inside Piston's per-run directory.
const WORKSPACE_PATH = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_./-]+$/;
export const SandboxWorkspaceFileSchema = z.object({
  path: z
    .string()
    .min(1, "file path must not be empty")
    .max(256, "file path is unreasonably long")
    .regex(WORKSPACE_PATH, "file path must be a forward-slash POSIX path with no ..-traversal"),
  content: z.string(),
});
export type SandboxWorkspaceFile = z.infer<typeof SandboxWorkspaceFileSchema>;

// On-disk shape: `code` (legacy single-file) OR `files` (STORY-043 multi-file). The preprocess
// normalizes the legacy shorthand into a 1-element `files` array using the per-language entry
// filename so the runtime always operates on a uniform shape.
const SandboxRunRequestRawSchema = z
  .object({
    language: SandboxLanguageSchema,
    files: z.array(SandboxWorkspaceFileSchema).min(1).max(64),
    entry_file: z.string().min(1).optional(),
    stdin: z.string().optional(),
    time_limit_ms: z.number().int().positive().max(60_000).default(DEFAULT_TIME_LIMIT_MS),
    memory_limit_mb: z.number().int().positive().max(2_048).default(DEFAULT_MEMORY_LIMIT_MB),
    output_limit_bytes: z
      .number()
      .int()
      .positive()
      .max(1_048_576)
      .default(DEFAULT_OUTPUT_LIMIT_BYTES),
    // Internal flag set by the legacy-shorthand preprocess; not part of the on-disk shape.
    __from_code_shorthand: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // Reject duplicate paths so the workspace materialization is deterministic.
    const seen = new Set<string>();
    for (let i = 0; i < data.files.length; i++) {
      const p = data.files[i]!.path;
      if (seen.has(p)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["files", i, "path"],
          message: `duplicate file path: ${p}`,
        });
      }
      seen.add(p);
    }
    if (data.entry_file !== undefined && !seen.has(data.entry_file)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entry_file"],
        message: `entry_file '${data.entry_file}' is not present in files[]`,
      });
    }
    // Legacy `code: ""` rejection.  Only enforced for the shorthand path (multi-file callers
    // can ship an empty file like `__init__.py` legitimately).
    if (data.__from_code_shorthand === true && data.files[0]?.content.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["code"],
        message: "code must not be empty",
      });
    }
  });

export const SandboxRunRequestSchema = z.preprocess((raw) => {
  // Legacy shorthand: `{ language, code: "..." }` → `{ language, files: [{ path: <entry>, content }] }`.
  // Both shapes are accepted forever; the playground keeps emitting `code` for single-file runs.
  // Empty `code` is preserved as-is so the shorthand-empty-code rejection still trips on the
  // refinement below (a workspace where the entry file is empty isn't a runnable program).
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    !("files" in raw) &&
    "code" in raw &&
    "language" in raw
  ) {
    const o = raw as { language?: unknown; code?: unknown };
    if (
      typeof o.code === "string" &&
      typeof o.language === "string" &&
      (o.language === "python" || o.language === "typescript")
    ) {
      const filename = ENTRY_FILE_BY_LANGUAGE[o.language];
      return {
        ...(raw as Record<string, unknown>),
        files: [{ path: filename, content: o.code }],
        // Preserve the entry filename explicitly so multi-file callers can pin a custom one
        // without breaking the legacy single-file shape.
        entry_file: filename,
        // Marker so the refinement below knows this came from the legacy shorthand and can
        // apply the historical "code must not be empty" rule without affecting multi-file
        // callers (where an empty file is legitimate, e.g. `__init__.py`).
        __from_code_shorthand: true,
      };
    }
  }
  return raw;
}, SandboxRunRequestRawSchema);

export type SandboxRunRequest = z.infer<typeof SandboxRunRequestSchema>;
// Pre-parse shape: callers pass this and zod fills in defaults at the boundary. The
// shorthand-with-`code` form is a separate union arm so callers can supply either shape
// from TypeScript without a cast.
export type SandboxRunRequestInput =
  | z.input<typeof SandboxRunRequestRawSchema>
  | {
      language: SandboxLanguage;
      code: string;
      stdin?: string;
      time_limit_ms?: number;
      memory_limit_mb?: number;
      output_limit_bytes?: number;
    };

export const SandboxRunResponseSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().int().nullable(),
  duration_ms: z.number().int().nonnegative(),
  killed_by: SandboxKilledBySchema.nullable(),
  language: SandboxLanguageSchema,
  runtime_version: z.string().optional(),
});
export type SandboxRunResponse = z.infer<typeof SandboxRunResponseSchema>;

// STORY-059 — streaming chunks emitted by `SandboxProvider.runStream()`. The chunks form a
// finite stream that always ends with exactly one `exit` chunk. v1 fake-streams by splitting
// the post-run stdout/stderr into newline-delimited tokens (Piston's HTTP API is
// request/response — see STORY-059 activity log). Real streaming lands when STORY-048
// (project-based learning) needs a long-running primitive.
export const SandboxStdoutChunkSchema = z.object({
  type: z.literal("stdout"),
  line: z.string(),
});
export const SandboxStderrChunkSchema = z.object({
  type: z.literal("stderr"),
  line: z.string(),
});
export const SandboxExitChunkSchema = z.object({
  type: z.literal("exit"),
  exit_code: z.number().int().nullable(),
  duration_ms: z.number().int().nonnegative(),
  killed_by: SandboxKilledBySchema.nullable(),
  language: SandboxLanguageSchema,
  runtime_version: z.string().optional(),
});
export const SandboxRunChunkSchema = z.discriminatedUnion("type", [
  SandboxStdoutChunkSchema,
  SandboxStderrChunkSchema,
  SandboxExitChunkSchema,
]);
export type SandboxStdoutChunk = z.infer<typeof SandboxStdoutChunkSchema>;
export type SandboxStderrChunk = z.infer<typeof SandboxStderrChunkSchema>;
export type SandboxExitChunk = z.infer<typeof SandboxExitChunkSchema>;
export type SandboxRunChunk = z.infer<typeof SandboxRunChunkSchema>;

export const SandboxTelemetryEventSchema = z.object({
  provider: z.string(),
  language: SandboxLanguageSchema,
  duration_ms: z.number().int().nonnegative(),
  killed_by: SandboxKilledBySchema.nullable(),
  exit_code: z.number().int().nullable(),
  stdout_bytes: z.number().int().nonnegative(),
  stderr_bytes: z.number().int().nonnegative(),
  ok: z.boolean(),
  decided_at: z.string().datetime(),
});
export type SandboxTelemetryEvent = z.infer<typeof SandboxTelemetryEventSchema>;

export interface SandboxTelemetrySink {
  record(event: SandboxTelemetryEvent): void;
}
