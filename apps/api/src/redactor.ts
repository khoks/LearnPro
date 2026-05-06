// STORY-056 — PiiRedactor interface used at every free-text ingestion point.
//
// The default impl chains regex (`@learnpro/shared.redactPii`) with an LLM second pass
// (`@learnpro/redaction.OrchestratedRedactor` + Haiku). Tests inject `inertRedactor` to skip the
// LLM call entirely, or `regexOnlyRedactor()` to use just the pure pass.

import { redactPii, type RedactionResult, type RedactionOptions } from "@learnpro/shared";
import {
  HaikuLlmAssistedRedactor,
  NoopLlmRedactor,
  OrchestratedRedactor,
} from "@learnpro/redaction";
import type { LLMProvider } from "@learnpro/llm";

export interface PiiRedactor {
  redact(text: string, options?: RedactionOptions): Promise<RedactionResult>;
}

// Pass-through redactor — leaves text unchanged. Used as a safe default in tests that don't
// care about redaction behavior. Production NEVER wires this — `defaultRedactor` is the prod path.
export const inertRedactor: PiiRedactor = {
  async redact(text) {
    return { redacted: text, scrubbed: [] };
  },
};

// Pure regex-only redactor — no LLM. Useful for hot paths that can't afford an extra LLM call
// or for offline mode.
export function regexOnlyRedactor(): PiiRedactor {
  return {
    async redact(text, options) {
      return redactPii(text, options ?? {});
    },
  };
}

// Production-default builder. Chains regex + Haiku (or NoopLlmRedactor if `llm` is null).
export function buildDefaultRedactor(input: { llm: LLMProvider | null }): PiiRedactor {
  const llmRedactor = input.llm
    ? new HaikuLlmAssistedRedactor({ llm: input.llm })
    : new NoopLlmRedactor();
  const orchestrator = new OrchestratedRedactor({ llmRedactor });
  return {
    async redact(text, options) {
      return orchestrator.redact(text, options);
    },
  };
}
