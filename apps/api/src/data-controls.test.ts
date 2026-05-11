import { describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import type { DataControlsAdapters } from "./data-controls.js";
import type { SessionResolver } from "./session.js";

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({
    user_id,
    org_id: "self",
    email: `${user_id}@learnpro.local`,
    is_admin: false,
  });

const USER_ID = "11111111-1111-4111-8111-111111111111";

function fakeAdapters(): DataControlsAdapters & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async summary(user_id) {
      calls.push(`summary(${user_id})`);
      return {
        episodes_count: 3,
        submissions_count: 5,
        interactions_count: 42,
        agent_calls_count: 12,
        voice_transcripts_count: 7,
        last_active_at: "2026-04-30T10:00:00.000Z",
      };
    },
    async deleteVoice(user_id) {
      calls.push(`deleteVoice(${user_id})`);
      return 7;
    },
    async deleteAccount(user_id) {
      calls.push(`deleteAccount(${user_id})`);
      return { deleted: true, deleted_user_id: user_id, sessions_invalidated: 2 };
    },
  };
}

describe("GET /v1/data/summary (STORY-056)", () => {
  it("401 when no session", async () => {
    const adapters = fakeAdapters();
    const app = buildServer({ dataControls: adapters });
    const res = await app.inject({ method: "GET", url: "/v1/data/summary" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the summary for an authenticated user", async () => {
    const adapters = fakeAdapters();
    const app = buildServer({
      dataControls: adapters,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "GET", url: "/v1/data/summary" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { episodes_count: number; voice_transcripts_count: number };
    expect(body.episodes_count).toBe(3);
    expect(body.voice_transcripts_count).toBe(7);
    expect(adapters.calls).toContain(`summary(${USER_ID})`);
    await app.close();
  });
});

describe("DELETE /v1/data/voice (STORY-056)", () => {
  it("401 when no session", async () => {
    const adapters = fakeAdapters();
    const app = buildServer({ dataControls: adapters });
    const res = await app.inject({ method: "DELETE", url: "/v1/data/voice" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("deletes the user's voice transcripts and returns the count", async () => {
    const adapters = fakeAdapters();
    const app = buildServer({
      dataControls: adapters,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "DELETE", url: "/v1/data/voice" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: 7 });
    expect(adapters.calls).toContain(`deleteVoice(${USER_ID})`);
    await app.close();
  });
});

describe("DELETE /v1/data/account (STORY-056)", () => {
  it("401 when no session", async () => {
    const adapters = fakeAdapters();
    const app = buildServer({ dataControls: adapters });
    const res = await app.inject({ method: "DELETE", url: "/v1/data/account" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("deletes the account, invalidates the session cookie, returns the count", async () => {
    const adapters = fakeAdapters();
    const app = buildServer({
      dataControls: adapters,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "DELETE", url: "/v1/data/account" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { deleted: boolean; sessions_invalidated: number };
    expect(body.deleted).toBe(true);
    expect(body.sessions_invalidated).toBe(2);
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : String(setCookie);
    expect(cookieStr).toContain("next-auth.session-token=");
    expect(cookieStr).toContain("Max-Age=0");
    await app.close();
  });

  it("404 when user already deleted (adapter returns deleted=false)", async () => {
    const adapters: DataControlsAdapters = {
      ...fakeAdapters(),
      async deleteAccount(user_id) {
        return { deleted: false, deleted_user_id: user_id, sessions_invalidated: 0 };
      },
    };
    const app = buildServer({
      dataControls: adapters,
      sessionResolver: userSession(USER_ID),
    });
    const res = await app.inject({ method: "DELETE", url: "/v1/data/account" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
