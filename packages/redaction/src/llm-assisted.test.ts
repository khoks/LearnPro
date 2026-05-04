import { describe, it, expect, vi } from "vitest";
import type {
  CompleteRequest,
  CompleteResponse,
  EmbedRequest,
  EmbedResponse,
  LLMProvider,
  StreamChunk,
  ToolCallRequest,
  ToolCallResponse,
} from "@learnpro/llm";
import { redactPii } from "@learnpro/shared";
import { HaikuLlmAssistedRedactor } from "./llm-assisted.js";

class FakeLLM implements LLMProvider {
  readonly name = "fake-llm";
  public lastRequest: CompleteRequest | null = null;
  public throwOnComplete = false;

  constructor(private readonly textOrFn: string | ((req: CompleteRequest) => string)) {}

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    this.lastRequest = req;
    if (this.throwOnComplete) throw new Error("simulated llm outage");
    const text = typeof this.textOrFn === "function" ? this.textOrFn(req) : this.textOrFn;
    return {
      text,
      model: req.model ?? "fake",
      finish_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 20 },
    };
  }

  stream(_req: CompleteRequest): AsyncIterable<StreamChunk> {
    throw new Error("not used in tests");
  }
  async embed(_req: EmbedRequest): Promise<EmbedResponse> {
    throw new Error("not used in tests");
  }
  async toolCall(_req: ToolCallRequest): Promise<ToolCallResponse> {
    throw new Error("not used in tests");
  }
}

describe("HaikuLlmAssistedRedactor", () => {
  it("returns the regex result unchanged when LLM finds nothing", async () => {
    const fake = new FakeLLM(JSON.stringify({ additional_redactions: [] }));
    const redactor = new HaikuLlmAssistedRedactor({ llm: fake });
    const text = "Hi — please email Jane at the school office.";
    const regexResult = redactPii(text);
    const out = await redactor.review(text, regexResult);
    expect(out).toEqual(regexResult);
    expect(fake.lastRequest).not.toBeNull();
    expect(fake.lastRequest?.system).toContain("privacy reviewer");
  });

  it("falls back to regex result when LLM throws", async () => {
    const fake = new FakeLLM("");
    fake.throwOnComplete = true;
    const logger = vi.fn();
    const redactor = new HaikuLlmAssistedRedactor({ llm: fake, logger });
    const text = "Hi there — name is John Smith and I live in Boston";
    const regexResult = redactPii(text);
    const out = await redactor.review(text, regexResult);
    expect(out).toEqual(regexResult);
    expect(logger).toHaveBeenCalledOnce();
  });

  it("falls back to regex result when LLM returns unparseable JSON", async () => {
    const fake = new FakeLLM("not actually json {{{");
    const logger = vi.fn();
    const redactor = new HaikuLlmAssistedRedactor({ llm: fake, logger });
    const text = "Borderline content here";
    const regexResult = redactPii(text);
    const out = await redactor.review(text, regexResult);
    expect(out).toEqual(regexResult);
    expect(logger).toHaveBeenCalledOnce();
  });

  it("strips markdown code fences from the LLM response", async () => {
    const fake = new FakeLLM(
      '```json\n{"additional_redactions": [{"type": "name", "span_start": 0, "span_end": 4}]}\n```',
    );
    const redactor = new HaikuLlmAssistedRedactor({ llm: fake });
    const text = "John lives in Boston";
    const regexResult = redactPii(text);
    const out = await redactor.review(text, regexResult);
    expect(out.redacted).toContain("[REDACTED:name]");
  });

  it("merges LLM-found name redaction into the regex result", async () => {
    // text positions: "John Smith works at Acme Corp." — flag "John Smith" (0..10)
    const fake = new FakeLLM(
      JSON.stringify({
        additional_redactions: [{ type: "name", span_start: 0, span_end: 10 }],
      }),
    );
    const redactor = new HaikuLlmAssistedRedactor({ llm: fake });
    const text = "John Smith works at Acme Corp.";
    const regexResult = redactPii(text);
    expect(regexResult.scrubbed).toEqual([]);
    const out = await redactor.review(text, regexResult);
    expect(out.redacted).toBe("[REDACTED:name] works at Acme Corp.");
    const nameEntry = out.scrubbed.find((e) => e.type === "gov_id");
    // Names land under gov_id in the count summary (per llm-assisted typeAsRedactionType note),
    // but the placeholder string itself preserves the precise label.
    expect(nameEntry?.count).toBe(1);
  });

  it("ignores LLM hallucinations with out-of-bounds spans", async () => {
    const fake = new FakeLLM(
      JSON.stringify({
        additional_redactions: [{ type: "name", span_start: 0, span_end: 9999 }],
      }),
    );
    const redactor = new HaikuLlmAssistedRedactor({ llm: fake });
    const text = "Short";
    const regexResult = redactPii(text);
    const out = await redactor.review(text, regexResult);
    expect(out).toEqual(regexResult);
  });

  it("skips overlapping LLM additions when they collide with regex hits", async () => {
    // Email is at position 13..30. LLM redundantly flags the same range as a 'name' — should be
    // ignored.
    const text = "Reach me at jane@example.com today";
    const regexResult = redactPii(text);
    const fake = new FakeLLM(
      JSON.stringify({
        additional_redactions: [{ type: "name", span_start: 12, span_end: 28 }],
      }),
    );
    const redactor = new HaikuLlmAssistedRedactor({ llm: fake });
    const out = await redactor.review(text, regexResult);
    // Only the regex's email span should appear once.
    const emailMatches = out.redacted.match(/\[REDACTED:email\]/g) ?? [];
    expect(emailMatches.length).toBe(1);
    const nameMatches = out.redacted.match(/\[REDACTED:name\]/g) ?? [];
    expect(nameMatches.length).toBe(0);
  });

  it("stamps user_id_for_telemetry on the LLM call when supplied", async () => {
    const fake = new FakeLLM(JSON.stringify({ additional_redactions: [] }));
    const redactor = new HaikuLlmAssistedRedactor({
      llm: fake,
      user_id_for_telemetry: "user-123",
    });
    await redactor.review("anything", redactPii("anything"));
    expect(fake.lastRequest?.user_id).toBe("user-123");
  });
});
