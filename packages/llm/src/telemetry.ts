import type { LLMTelemetryEvent, LLMTelemetrySink } from "./types.js";

export class NullLLMTelemetrySink implements LLMTelemetrySink {
  record(_event: LLMTelemetryEvent): void {}
}

export class InMemoryLLMTelemetrySink implements LLMTelemetrySink {
  readonly events: LLMTelemetryEvent[] = [];
  record(event: LLMTelemetryEvent): void {
    this.events.push(event);
  }
}
