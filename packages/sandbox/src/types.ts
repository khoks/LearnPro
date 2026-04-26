import { z } from "zod";

export const SandboxLanguageSchema = z.enum(["python", "typescript"]);
export type SandboxLanguage = z.infer<typeof SandboxLanguageSchema>;

export const SandboxKilledBySchema = z.enum(["timeout", "memory", "output-limit", "signal"]);
export type SandboxKilledBy = z.infer<typeof SandboxKilledBySchema>;

export const DEFAULT_TIME_LIMIT_MS = 5_000;
export const DEFAULT_MEMORY_LIMIT_MB = 128;
export const DEFAULT_OUTPUT_LIMIT_BYTES = 64 * 1024;

export const SandboxRunRequestSchema = z.object({
  language: SandboxLanguageSchema,
  code: z.string().min(1, "code must not be empty"),
  stdin: z.string().optional(),
  time_limit_ms: z.number().int().positive().max(60_000).default(DEFAULT_TIME_LIMIT_MS),
  memory_limit_mb: z.number().int().positive().max(2_048).default(DEFAULT_MEMORY_LIMIT_MB),
  output_limit_bytes: z
    .number()
    .int()
    .positive()
    .max(1_048_576)
    .default(DEFAULT_OUTPUT_LIMIT_BYTES),
});
export type SandboxRunRequest = z.infer<typeof SandboxRunRequestSchema>;
// Pre-parse shape: callers pass this and zod fills in defaults at the boundary.
export type SandboxRunRequestInput = z.input<typeof SandboxRunRequestSchema>;

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
