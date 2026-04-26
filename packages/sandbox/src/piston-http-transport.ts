import type { PistonExecuteParams, PistonExecuteResponse, PistonTransport } from "./piston.js";

export interface PistonHttpTransportOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class PistonHttpTransport implements PistonTransport {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: PistonHttpTransportOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async execute(params: PistonExecuteParams): Promise<PistonExecuteResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/v2/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Piston HTTP ${res.status}: ${body || res.statusText}`);
      }
      return (await res.json()) as PistonExecuteResponse;
    } finally {
      clearTimeout(timer);
    }
  }
}
