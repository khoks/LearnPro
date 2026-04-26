import type {
  CompleteRequest,
  CompleteResponse,
  EmbedRequest,
  EmbedResponse,
  StreamChunk,
  ToolCallRequest,
  ToolCallResponse,
} from "./types.js";

export interface LLMProvider {
  readonly name: string;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
  stream(req: CompleteRequest): AsyncIterable<StreamChunk>;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  toolCall(req: ToolCallRequest): Promise<ToolCallResponse>;
}
