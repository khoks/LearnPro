import { z } from "zod";

export * from "./interactions.js";
export * from "./onboarding.js";

export const HealthPayloadSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
});

export type HealthPayload = z.infer<typeof HealthPayloadSchema>;

const VERSION = "0.1.0";

export function healthPayload(input: { service: string }): HealthPayload {
  return {
    ok: true,
    service: input.service,
    version: VERSION,
    timestamp: new Date().toISOString(),
  };
}
