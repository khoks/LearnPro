import type { PolicyTelemetryEvent, PolicyTelemetrySink } from "./types.js";

export class NullPolicyTelemetrySink implements PolicyTelemetrySink {
  record(_event: PolicyTelemetryEvent): void {}
}

export class InMemoryPolicyTelemetrySink implements PolicyTelemetrySink {
  readonly events: PolicyTelemetryEvent[] = [];
  record(event: PolicyTelemetryEvent): void {
    this.events.push(event);
  }
}

export function digest(value: unknown): string {
  const json = JSON.stringify(value, Object.keys(value as object).sort());
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = (h * 31 + json.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
