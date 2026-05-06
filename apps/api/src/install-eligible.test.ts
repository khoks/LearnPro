import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { INSTALL_PROMPT_THRESHOLD, registerInstallEligibleRoutes } from "./install-eligible.js";

// STORY-044 — install-eligible Fastify route. Pure-Fastify tests with a fake `db` shape; the
// real `countSuccessfulEpisodes` query is integration-tested in @learnpro/db.

interface FakeDbState {
  successByUser: Record<string, number>;
}

// Minimal stub that mimics @learnpro/db's countSuccessfulEpisodes call surface. We intercept
// the SELECT pipeline that countSuccessfulEpisodes builds and return our fixture count.
function buildFakeDb(state: FakeDbState): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  setSuccess(userId: string, n: number): void;
} {
  const db = {
    select(): unknown {
      let userId: string | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        from(): unknown {
          return builder;
        },
        where(query: { queryChunks?: unknown[] }): Promise<{ count: number }[]> {
          // The where call above passes a sql template. We can't introspect it precisely
          // without pulling in drizzle internals, so we cheat: inject a `_setUserId` hook
          // that tests use to scope counts.
          // For this fake, just return whatever the latest `_setUserId` was.
          void query;
          const id = userId ?? "";
          const count = state.successByUser[id] ?? 0;
          return Promise.resolve([{ count }]);
        },
        // Test helper — set the userId we resolve.
        _setUserId(id: string): void {
          userId = id;
        },
      };
      return builder;
    },
  };
  return {
    db,
    setSuccess(userId: string, n: number): void {
      state.successByUser[userId] = n;
    },
  };
}

// Cheap shortcut: directly stub countSuccessfulEpisodes via module-level import-mock would be
// preferable, but it requires vi.mock setup. Instead, use a tiny in-process Fastify server with
// an explicit countSuccessfulEpisodes injection point. To keep the production wiring simple we
// don't expose that injection point in the route itself; we test through a real fastify server
// against a hand-rolled session resolver + a hand-rolled db, accepting that we don't exercise
// the SQL — that's covered by autonomy-signal.test.ts integration tests.
//
// Per-test we build a wrapper around the real `registerInstallEligibleRoutes` and stub the
// `db` to conform to whatever the helper invokes.

async function buildServer(opts: {
  successCount: number;
  authed: boolean;
}): Promise<{ app: ReturnType<typeof Fastify> }> {
  const app = Fastify({ logger: false });

  const state: FakeDbState = { successByUser: { "user-1": opts.successCount } };
  const fake = buildFakeDb(state);
  // Make the where() return the fixture count regardless — test ergonomics over fidelity.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fake.db.select = (): any => ({
    from: () => ({
      where: () => Promise.resolve([{ count: opts.successCount }]),
    }),
  });

  registerInstallEligibleRoutes(app, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: fake.db as any,
    sessionResolver: opts.authed
      ? async () => ({ user_id: "user-1", org_id: "self", email: "user-1@learnpro.local" })
      : async () => null,
  });
  return { app };
}

describe("registerInstallEligibleRoutes — STORY-044", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    const { app } = await buildServer({ successCount: 5, authed: false });
    const res = await app.inject({ method: "GET", url: "/v1/dashboard/install-eligible" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns eligible=true when successful_episodes >= threshold", async () => {
    const { app } = await buildServer({ successCount: 3, authed: true });
    const res = await app.inject({ method: "GET", url: "/v1/dashboard/install-eligible" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      eligible: true,
      successful_episodes: 3,
      threshold: INSTALL_PROMPT_THRESHOLD,
    });
  });

  it("returns eligible=false when successful_episodes < threshold", async () => {
    const { app } = await buildServer({ successCount: 2, authed: true });
    const res = await app.inject({ method: "GET", url: "/v1/dashboard/install-eligible" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      eligible: false,
      successful_episodes: 2,
      threshold: INSTALL_PROMPT_THRESHOLD,
    });
  });

  it("returns eligible=false at the cold-start zero count", async () => {
    const { app } = await buildServer({ successCount: 0, authed: true });
    const res = await app.inject({ method: "GET", url: "/v1/dashboard/install-eligible" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      eligible: false,
      successful_episodes: 0,
    });
  });

  it("returns eligible=true with a high success count (sanity bound)", async () => {
    const { app } = await buildServer({ successCount: 47, authed: true });
    const res = await app.inject({ method: "GET", url: "/v1/dashboard/install-eligible" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      eligible: true,
      successful_episodes: 47,
    });
  });
});
