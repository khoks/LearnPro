import type { LlmAssistedRedactor, RedactionResult } from "@learnpro/shared";

// `NoopLlmRedactor` is the dev / test default — no LLM round-trip, just hand back what the
// regex pass produced. Production wiring uses `HaikuLlmAssistedRedactor` instead.
export class NoopLlmRedactor implements LlmAssistedRedactor {
  async review(_text: string, regexResult: RedactionResult): Promise<RedactionResult> {
    return regexResult;
  }
}
