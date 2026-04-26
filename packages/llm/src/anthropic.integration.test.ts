import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "./anthropic.js";
import { AnthropicSdkTransport } from "./anthropic-sdk-transport.js";

const apiKey = process.env["ANTHROPIC_API_KEY"];
const describeIfKey = apiKey ? describe : describe.skip;

describeIfKey("AnthropicProvider (integration — requires ANTHROPIC_API_KEY)", () => {
  it("returns a non-empty completion from a real Anthropic call", async () => {
    const provider = new AnthropicProvider({
      transport: new AnthropicSdkTransport({ apiKey: apiKey! }),
    });
    const res = await provider.complete({
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
      role: "router",
      max_tokens: 16,
      temperature: 0,
    });
    expect(res.text.length).toBeGreaterThan(0);
    expect(res.usage.input_tokens).toBeGreaterThan(0);
  }, 30_000);
});
