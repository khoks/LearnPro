import {
  redactPii,
  shouldInvokeLlmReview,
  type LlmAssistedRedactor,
  type RedactionOptions,
  type RedactionResult,
} from "@learnpro/shared";

// `OrchestratedRedactor` is the production-shape entrypoint: regex-first, LLM second-pass when
// the regex result is borderline. Tests inject a `NoopLlmRedactor` to skip the LLM call entirely.

export interface OrchestratedRedactorOptions {
  llmRedactor: LlmAssistedRedactor;
  // When `false`, skip the LLM second pass even on borderline input. Useful for offline mode +
  // tests that explicitly want regex-only behavior.
  enableLlmReview?: boolean;
}

export class OrchestratedRedactor {
  private readonly llmRedactor: LlmAssistedRedactor;
  private readonly enableLlmReview: boolean;

  constructor(opts: OrchestratedRedactorOptions) {
    this.llmRedactor = opts.llmRedactor;
    this.enableLlmReview = opts.enableLlmReview ?? true;
  }

  async redact(text: string, options?: RedactionOptions): Promise<RedactionResult> {
    const regexResult = redactPii(text, options);
    if (!this.enableLlmReview) return regexResult;
    if (!shouldInvokeLlmReview(text, regexResult)) return regexResult;
    return this.llmRedactor.review(text, regexResult);
  }
}
