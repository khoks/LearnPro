import { describe, it, expect, vi } from "vitest";
import type { LlmAssistedRedactor, RedactionResult } from "@learnpro/shared";
import { NoopLlmRedactor } from "./noop.js";
import { OrchestratedRedactor } from "./orchestrator.js";

class SpyLlmRedactor implements LlmAssistedRedactor {
  public calls: { text: string; regexResult: RedactionResult }[] = [];
  constructor(private readonly out?: RedactionResult) {}
  async review(text: string, regexResult: RedactionResult): Promise<RedactionResult> {
    this.calls.push({ text, regexResult });
    return this.out ?? regexResult;
  }
}

describe("OrchestratedRedactor", () => {
  it("does NOT call the LLM when regex finds a high-confidence email match", async () => {
    const spy = new SpyLlmRedactor();
    const orchestrator = new OrchestratedRedactor({ llmRedactor: spy });
    const out = await orchestrator.redact("ping foo@bar.com today");
    expect(spy.calls).toHaveLength(0);
    expect(out.redacted).toContain("[REDACTED:email]");
  });

  it("does NOT call the LLM when regex finds a credit-card match", async () => {
    const spy = new SpyLlmRedactor();
    const orchestrator = new OrchestratedRedactor({ llmRedactor: spy });
    await orchestrator.redact("on file: 4242 4242 4242 4242 expires 2030");
    expect(spy.calls).toHaveLength(0);
  });

  it("DOES call the LLM when regex finds nothing in non-trivial input", async () => {
    const spy = new SpyLlmRedactor();
    const orchestrator = new OrchestratedRedactor({ llmRedactor: spy });
    await orchestrator.redact("Jane was sitting in the school office today");
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]?.regexResult.scrubbed).toEqual([]);
  });

  it("does NOT call the LLM for trivially-short input", async () => {
    const spy = new SpyLlmRedactor();
    const orchestrator = new OrchestratedRedactor({ llmRedactor: spy });
    await orchestrator.redact("ok");
    expect(spy.calls).toHaveLength(0);
  });

  it("respects enableLlmReview=false (regex-only mode)", async () => {
    const spy = new SpyLlmRedactor();
    const orchestrator = new OrchestratedRedactor({ llmRedactor: spy, enableLlmReview: false });
    await orchestrator.redact("Jane Smith works at Acme on a Tuesday");
    expect(spy.calls).toHaveLength(0);
  });

  it("integrates cleanly with NoopLlmRedactor (real interface impl, no LLM)", async () => {
    const noop = new NoopLlmRedactor();
    const reviewSpy = vi.spyOn(noop, "review");
    const orchestrator = new OrchestratedRedactor({ llmRedactor: noop });
    const out = await orchestrator.redact(
      "Hi — please mention this in tomorrow's standup, the PR is ready",
    );
    expect(reviewSpy).toHaveBeenCalled();
    expect(out.redacted).toBe("Hi — please mention this in tomorrow's standup, the PR is ready");
  });

  it("forwards allowUrls option to redactPii (regex behavior)", async () => {
    const spy = new SpyLlmRedactor();
    const orchestrator = new OrchestratedRedactor({ llmRedactor: spy });
    const out = await orchestrator.redact("see https://docs.example.com/guide", {
      allowUrls: true,
    });
    // URL not scrubbed, so regex returns 0 hits → LLM IS called
    expect(out.redacted).toContain("https://docs.example.com/guide");
    expect(spy.calls).toHaveLength(1);
  });
});
