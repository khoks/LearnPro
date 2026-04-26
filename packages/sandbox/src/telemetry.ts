import type { SandboxTelemetryEvent, SandboxTelemetrySink } from "./types.js";

export class NullSandboxTelemetrySink implements SandboxTelemetrySink {
  record(_event: SandboxTelemetryEvent): void {}
}

export class InMemorySandboxTelemetrySink implements SandboxTelemetrySink {
  readonly events: SandboxTelemetryEvent[] = [];

  record(event: SandboxTelemetryEvent): void {
    this.events.push(event);
  }
}
