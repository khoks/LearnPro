import { NotImplementedError } from "./errors.js";
import type { LLMProvider } from "./provider.js";
import type {
  CompleteRequest,
  CompleteResponse,
  EmbedRequest,
  EmbedResponse,
  StreamChunk,
  ToolCallRequest,
  ToolCallResponse,
} from "./types.js";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  complete(_req: CompleteRequest): Promise<CompleteResponse> {
    throw new NotImplementedError(this.name, "complete");
  }

  stream(_req: CompleteRequest): AsyncIterable<StreamChunk> {
    throw new NotImplementedError(this.name, "stream");
  }

  embed(_req: EmbedRequest): Promise<EmbedResponse> {
    throw new NotImplementedError(this.name, "embed");
  }

  toolCall(_req: ToolCallRequest): Promise<ToolCallResponse> {
    throw new NotImplementedError(this.name, "toolCall");
  }
}
