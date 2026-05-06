import { describe, it } from "vitest";
import { DEFAULT_REPO_NAME } from "./templates.js";

// Real test suite lands in commit 2. This shim keeps `vitest --passWithNoTests` green and
// makes `pnpm typecheck` happy until then.

describe("STORY-040 portfolio templates (skeleton)", () => {
  it("exports DEFAULT_REPO_NAME = learnpro-portfolio", ({ expect }) => {
    expect(DEFAULT_REPO_NAME).toBe("learnpro-portfolio");
  });
});
