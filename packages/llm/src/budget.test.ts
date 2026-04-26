import { describe, expect, it } from "vitest";
import { DailyTokenBudget, InMemoryUsageStore, MODEL_TIERS } from "./budget.js";
import { ANTHROPIC_HAIKU, ANTHROPIC_OPUS } from "./models.js";
import { ANTHROPIC_SONNET } from "./pricing.js";
import { TokenBudgetExceededError } from "./errors.js";

describe("InMemoryUsageStore", () => {
  it("returns 0 for an unseen user", async () => {
    const store = new InMemoryUsageStore();
    expect(await store.today("u1")).toBe(0);
  });

  it("accumulates tokens for the same user/day", async () => {
    const store = new InMemoryUsageStore();
    const day = new Date("2026-04-26T12:00:00Z");
    await store.record("u1", 100, day);
    await store.record("u1", 250, day);
    expect(await store.today("u1", day)).toBe(350);
  });

  it("partitions buckets by UTC date", async () => {
    const store = new InMemoryUsageStore();
    const d1 = new Date("2026-04-26T23:59:00Z");
    const d2 = new Date("2026-04-27T00:01:00Z");
    await store.record("u1", 100, d1);
    await store.record("u1", 50, d2);
    expect(await store.today("u1", d1)).toBe(100);
    expect(await store.today("u1", d2)).toBe(50);
  });

  it("partitions buckets by user", async () => {
    const store = new InMemoryUsageStore();
    const day = new Date("2026-04-26T12:00:00Z");
    await store.record("u1", 100, day);
    await store.record("u2", 999, day);
    expect(await store.today("u1", day)).toBe(100);
    expect(await store.today("u2", day)).toBe(999);
  });
});

describe("DailyTokenBudget.assertWithinBudget", () => {
  it("is a no-op when limit is 0 (unlimited / self-hosted default)", async () => {
    const budget = new DailyTokenBudget({
      store: new InMemoryUsageStore(),
      daily_limit_tokens: 0,
    });
    await budget.record("u1", 999_999_999);
    await expect(budget.assertWithinBudget("u1")).resolves.toBeUndefined();
  });

  it("is a no-op when no user_id is provided (system call)", async () => {
    const budget = new DailyTokenBudget({
      store: new InMemoryUsageStore(),
      daily_limit_tokens: 1000,
    });
    await expect(budget.assertWithinBudget(undefined)).resolves.toBeUndefined();
  });

  it("throws TokenBudgetExceededError when used >= limit", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 1000);
    await expect(budget.assertWithinBudget("u1")).rejects.toBeInstanceOf(TokenBudgetExceededError);
  });

  it("does not throw while under the limit", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 999);
    await expect(budget.assertWithinBudget("u1")).resolves.toBeUndefined();
  });
});

describe("DailyTokenBudget.decideModel", () => {
  it("explicit model always wins (reason: explicit)", async () => {
    const budget = new DailyTokenBudget({
      store: new InMemoryUsageStore(),
      daily_limit_tokens: 1000,
    });
    const r = await budget.decideModel({
      user_id: "u1",
      role: "tutor",
      explicit_model: "some-other-model",
    });
    expect(r.model).toBe("some-other-model");
    expect(r.reason).toBe("explicit");
  });

  it("returns baseline with reason=no_user when user_id is missing", async () => {
    const budget = new DailyTokenBudget({
      store: new InMemoryUsageStore(),
      daily_limit_tokens: 1000,
    });
    const r = await budget.decideModel({ role: "tutor", user_id: "" });
    expect(r.model).toBe(ANTHROPIC_OPUS);
    expect(r.reason).toBe("no_user");
    expect(r.tier).toBe("premium");
  });

  it("returns baseline with reason=unlimited when limit is 0", async () => {
    const budget = new DailyTokenBudget({
      store: new InMemoryUsageStore(),
      daily_limit_tokens: 0,
    });
    const r = await budget.decideModel({ user_id: "u1", role: "tutor" });
    expect(r.model).toBe(ANTHROPIC_OPUS);
    expect(r.reason).toBe("unlimited");
  });

  it("returns baseline with reason=under_threshold when ratio < 0.8", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 500);
    const r = await budget.decideModel({ user_id: "u1", role: "tutor" });
    expect(r.model).toBe(ANTHROPIC_OPUS);
    expect(r.reason).toBe("under_threshold");
    expect(r.ratio).toBe(0.5);
  });

  it("downgrades premium → mid when at the threshold", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 800);
    const r = await budget.decideModel({ user_id: "u1", role: "tutor" });
    expect(r.model).toBe(ANTHROPIC_SONNET);
    expect(r.tier).toBe("mid");
    expect(r.reason).toBe("downgraded");
    expect(r.ratio).toBe(0.8);
  });

  it("downgrades mid → cheap when at the threshold (router → Haiku stays cheap)", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({
      store,
      daily_limit_tokens: 1000,
      models: {
        tutor: ANTHROPIC_OPUS,
        interviewer: ANTHROPIC_OPUS,
        reflection: ANTHROPIC_OPUS,
        grader: ANTHROPIC_SONNET,
        router: ANTHROPIC_SONNET,
      },
    });
    await budget.record("u1", 900);
    const r = await budget.decideModel({ user_id: "u1", role: "router" });
    expect(r.model).toBe(ANTHROPIC_HAIKU);
    expect(r.tier).toBe("cheap");
    expect(r.reason).toBe("downgraded");
  });

  it("does not downgrade if baseline is already cheap (no tier below)", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 900);
    const r = await budget.decideModel({ user_id: "u1", role: "router" });
    expect(r.model).toBe(ANTHROPIC_HAIKU);
    expect(r.tier).toBe("cheap");
    expect(r.reason).toBe("downgraded");
  });

  it("returns baseline (no downgrade) when baseline is not on the tier ladder", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({
      store,
      daily_limit_tokens: 1000,
      models: {
        tutor: "off-ladder-model",
        interviewer: ANTHROPIC_OPUS,
        reflection: ANTHROPIC_OPUS,
        grader: ANTHROPIC_HAIKU,
        router: ANTHROPIC_HAIKU,
      },
    });
    await budget.record("u1", 900);
    const r = await budget.decideModel({ user_id: "u1", role: "tutor" });
    expect(r.model).toBe("off-ladder-model");
    expect(r.tier).toBeNull();
    expect(r.reason).toBe("under_threshold");
  });

  it("custom downgrade_threshold is respected", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({
      store,
      daily_limit_tokens: 1000,
      downgrade_threshold: 0.5,
    });
    await budget.record("u1", 500);
    const r = await budget.decideModel({ user_id: "u1", role: "tutor" });
    expect(r.reason).toBe("downgraded");
    expect(r.model).toBe(ANTHROPIC_SONNET);
  });
});

describe("DailyTokenBudget.record", () => {
  it("ignores zero or negative tokens", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record("u1", 0);
    await budget.record("u1", -5);
    expect(await store.today("u1")).toBe(0);
  });

  it("ignores calls without a user_id", async () => {
    const store = new InMemoryUsageStore();
    const budget = new DailyTokenBudget({ store, daily_limit_tokens: 1000 });
    await budget.record(undefined, 100);
    expect(await store.today("anon")).toBe(0);
  });
});

describe("MODEL_TIERS", () => {
  it("maps premium/mid/cheap to Opus/Sonnet/Haiku", () => {
    expect(MODEL_TIERS.premium).toBe(ANTHROPIC_OPUS);
    expect(MODEL_TIERS.mid).toBe(ANTHROPIC_SONNET);
    expect(MODEL_TIERS.cheap).toBe(ANTHROPIC_HAIKU);
  });
});
