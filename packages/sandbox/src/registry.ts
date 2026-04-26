import { z } from "zod";
import type { SandboxProvider } from "./provider.js";
import {
  DEFAULT_PISTON_LANGUAGES,
  PistonSandboxProvider,
  type PistonLanguageSpec,
  type PistonTransport,
} from "./piston.js";
import { PistonHttpTransport } from "./piston-http-transport.js";
import { NullSandboxTelemetrySink } from "./telemetry.js";
import { SandboxLanguageSchema, type SandboxLanguage, type SandboxTelemetrySink } from "./types.js";

const PistonLanguageSpecSchema = z.object({
  pistonLanguage: z.string().min(1),
  pistonVersion: z.string().min(1),
  filename: z.string().min(1),
});

export const SandboxConfigSchema = z.object({
  provider: z.enum(["piston"]).default("piston"),
  baseUrl: z.string().url().default("http://localhost:2000"),
  languages: z.record(SandboxLanguageSchema, PistonLanguageSpecSchema).optional(),
});
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

export interface BuildSandboxOptions {
  config?: SandboxConfig;
  telemetry?: SandboxTelemetrySink;
  pistonTransport?: PistonTransport;
}

export function buildSandboxProvider(opts: BuildSandboxOptions = {}): SandboxProvider {
  const config = opts.config ?? SandboxConfigSchema.parse({});
  const telemetry = opts.telemetry ?? new NullSandboxTelemetrySink();
  switch (config.provider) {
    case "piston": {
      const transport =
        opts.pistonTransport ?? new PistonHttpTransport({ baseUrl: config.baseUrl });
      const languages: Partial<Record<SandboxLanguage, PistonLanguageSpec>> = {
        ...DEFAULT_PISTON_LANGUAGES,
        ...(config.languages ?? {}),
      };
      return new PistonSandboxProvider({ transport, languages, telemetry });
    }
  }
}

export function loadSandboxConfigFromEnv(env: NodeJS.ProcessEnv): SandboxConfig {
  const raw = env["LEARNPRO_SANDBOX_CONFIG"];
  if (!raw) {
    const fallback: Record<string, unknown> = {};
    if (env["PISTON_URL"]) fallback["baseUrl"] = env["PISTON_URL"];
    return SandboxConfigSchema.parse(fallback);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`LEARNPRO_SANDBOX_CONFIG is not valid JSON: ${(err as Error).message}`);
  }
  return SandboxConfigSchema.parse(parsed);
}
