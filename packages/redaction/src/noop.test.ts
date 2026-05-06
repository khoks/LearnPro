import { describe, it, expect } from "vitest";
import { redactPii } from "@learnpro/shared";
import { NoopLlmRedactor } from "./noop.js";

describe("NoopLlmRedactor", () => {
  it("returns the input regex result unchanged", async () => {
    const text = "ping foo@bar.com";
    const regexResult = redactPii(text);
    const noop = new NoopLlmRedactor();
    const out = await noop.review(text, regexResult);
    expect(out).toEqual(regexResult);
  });

  it("returns the input even when the regex produced nothing", async () => {
    const text = "hello world";
    const regexResult = redactPii(text);
    const noop = new NoopLlmRedactor();
    const out = await noop.review(text, regexResult);
    expect(out).toEqual(regexResult);
    expect(out.scrubbed).toEqual([]);
  });
});
