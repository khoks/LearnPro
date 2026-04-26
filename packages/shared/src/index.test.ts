import { describe, it, expect } from "vitest";
import { healthPayload, HealthPayloadSchema } from "./index.js";

describe("@learnpro/shared", () => {
  it("healthPayload produces a Zod-valid HealthPayload", () => {
    const p = healthPayload({ service: "test" });
    const parsed = HealthPayloadSchema.parse(p);
    expect(parsed.service).toBe("test");
    expect(parsed.ok).toBe(true);
  });
});
