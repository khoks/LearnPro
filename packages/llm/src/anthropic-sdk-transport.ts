import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import type {
  AnthropicCreateParams,
  AnthropicMessageResponse,
  AnthropicStreamEvent,
  AnthropicTransport,
} from "./anthropic.js";

export interface AnthropicSdkTransportOptions {
  apiKey: string;
  baseURL?: string;
}

export class AnthropicSdkTransport implements AnthropicTransport {
  private readonly client: Anthropic;

  constructor(opts: AnthropicSdkTransportOptions) {
    this.client = new Anthropic(
      opts.baseURL ? { apiKey: opts.apiKey, baseURL: opts.baseURL } : { apiKey: opts.apiKey },
    );
  }

  async createMessage(params: AnthropicCreateParams): Promise<AnthropicMessageResponse> {
    const sdkParams = toSdkParams(params);
    const res = (await this.client.messages.create(sdkParams)) as Message;
    return {
      model: res.model,
      stop_reason: res.stop_reason,
      usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
      content: res.content.map((block) => {
        if (block.type === "text") {
          return { type: "text", text: block.text };
        }
        if (block.type === "tool_use") {
          return {
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          };
        }
        return { type: "text", text: "" };
      }),
    };
  }

  async *streamMessage(params: AnthropicCreateParams): AsyncIterable<AnthropicStreamEvent> {
    const sdkParams = toSdkParams(params);
    const stream = this.client.messages.stream(sdkParams);
    for await (const event of stream) {
      yield event as unknown as AnthropicStreamEvent;
    }
  }
}

function toSdkParams(params: AnthropicCreateParams): MessageCreateParamsNonStreaming {
  const out: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.max_tokens,
    temperature: params.temperature,
    messages: params.messages,
  };
  if (params.system !== undefined) out["system"] = params.system;
  if (params.tools !== undefined) out["tools"] = params.tools;
  if (params.tool_choice !== undefined) out["tool_choice"] = params.tool_choice;
  return out as unknown as MessageCreateParamsNonStreaming;
}
