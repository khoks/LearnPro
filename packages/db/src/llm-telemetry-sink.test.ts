import type { LLMTelemetryEvent } from "@learnpro/llm";
import { describe, expect, it, vi } from "vitest";
import type { LearnProDb } from "./client.js";
import { DrizzleLLMTelemetrySink } from "./llm-telemetry-sink.js";

function ev(overrides: Partial<LLMTelemetryEvent> = {}): LLMTelemetryEvent {
  return {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    task: "complete",
    input_tokens: 100,
    output_tokens: 50,
    cost_usd: 0.000123,
    pricing_version: "2026-04-26",
    latency_ms: 250,
    ok: true,
    decided_at: new Date("2026-04-26T12:00:00Z").toISOString(),
    ...overrides,
  };
}

// The sink uses Drizzle's `db.insert(table).values(...)` chain. We stub `insert` so we can
// inspect what would have been written without spinning up Postgres for these unit tests.
// Integration tests against the real schema live in `llm-usage-store.test.ts` (gated by DATABASE_URL).
function stubDb(insertImpl: (values: unknown) => Promise<void> | void): LearnProDb {
  const chain = {
    values: vi.fn(async (v: unknown) => {
      await insertImpl(v);
    }),
  };
  return {
    insert: vi.fn(() => chain),
  } as unknown as LearnProDb;
}

describe("DrizzleLLMTelemetrySink", () => {
  it("maps a fully-populated event to an INSERT (every optional field carried through)", async () => {
    const captured: unknown[] = [];
    const db = stubDb((v) => {
      captured.push(v);
    });
    const sink = new DrizzleLLMTelemetrySink({ db });
    sink.record(
      ev({
        role: "tutor",
        user_id: "00000000-0000-4000-8000-000000000001",
        session_id: "sess-42",
        cached_tokens: 12,
        tool_used: "give-hint",
        prompt_version: "tutor@v1",
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(captured).toHaveLength(1);
    const row = captured[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      task: "complete",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: "0.00012300",
      pricing_version: "2026-04-26",
      latency_ms: 250,
      ok: true,
      role: "tutor",
      user_id: "00000000-0000-4000-8000-000000000001",
      session_id: "sess-42",
      cached_tokens: 12,
      tool_used: "give-hint",
      prompt_version: "tutor@v1",
    });
    expect(row["called_at"]).toBeInstanceOf(Date);
  });

  it("omits optional fields entirely when not provided (no spurious nulls)", async () => {
    const captured: unknown[] = [];
    const db = stubDb((v) => {
      captured.push(v);
    });
    const sink = new DrizzleLLMTelemetrySink({ db });
    sink.record(ev());
    await new Promise((r) => setImmediate(r));
    const row = captured[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("role");
    expect(row).not.toHaveProperty("user_id");
    expect(row).not.toHaveProperty("session_id");
    expect(row).not.toHaveProperty("cached_tokens");
    expect(row).not.toHaveProperty("tool_used");
    expect(row).not.toHaveProperty("prompt_version");
    expect(row).not.toHaveProperty("org_id");
  });

  it("stamps the configured org_id on every row", async () => {
    const captured: unknown[] = [];
    const db = stubDb((v) => {
      captured.push(v);
    });
    const sink = new DrizzleLLMTelemetrySink({ db, org_id: "acme" });
    sink.record(ev());
    await new Promise((r) => setImmediate(r));
    expect((captured[0] as Record<string, unknown>)["org_id"]).toBe("acme");
  });

  it("formats cost_usd with 8 decimals as a string (avoids float64 round-trip)", async () => {
    const captured: unknown[] = [];
    const db = stubDb((v) => {
      captured.push(v);
    });
    const sink = new DrizzleLLMTelemetrySink({ db });
    sink.record(ev({ cost_usd: 0.00000001 }));
    sink.record(ev({ cost_usd: 12.5 }));
    sink.record(ev({ cost_usd: 0 }));
    await new Promise((r) => setImmediate(r));
    expect((captured[0] as Record<string, unknown>)["cost_usd"]).toBe("0.00000001");
    expect((captured[1] as Record<string, unknown>)["cost_usd"]).toBe("12.50000000");
    expect((captured[2] as Record<string, unknown>)["cost_usd"]).toBe("0.00000000");
  });

  it("swallows insert errors and forwards them to the configured logger", async () => {
    const errors: Array<{ msg: string; err: unknown }> = [];
    const db = stubDb(() => {
      throw new Error("connection refused");
    });
    const sink = new DrizzleLLMTelemetrySink({
      db,
      logger: (msg, err) => errors.push({ msg, err }),
    });
    sink.record(ev());
    await new Promise((r) => setImmediate(r));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.msg).toContain("insert failed");
    expect(errors[0]?.err).toBeInstanceOf(Error);
  });

  it("falls back to current time when decided_at is unparseable (defensive)", async () => {
    const captured: unknown[] = [];
    const db = stubDb((v) => {
      captured.push(v);
    });
    const sink = new DrizzleLLMTelemetrySink({ db });
    sink.record(ev({ decided_at: "not-a-date" }));
    await new Promise((r) => setImmediate(r));
    const calledAt = (captured[0] as Record<string, unknown>)["called_at"];
    expect(calledAt).toBeInstanceOf(Date);
    expect(Number.isNaN((calledAt as Date).getTime())).toBe(false);
  });
});
