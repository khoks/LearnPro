import type { LearnProDb } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

// STORY-040 — exercises the 5 portfolio routes with mocked @learnpro/db helpers + a fake
// GitHubPortfolioClient. Mirrors the structure of quiet-hours.test.ts: vi.mock the helper
// surface, inject a fake DB, drive the server with `app.inject`.

const getEpisodeForPush = vi.fn();
const getPortfolioSettings = vi.fn();
const listRecentPushes = vi.fn();
const recordPush = vi.fn();
const updatePortfolioSettings = vi.fn();

// Fake `db` whose `select` chain returns the rows we control via `lookupTokenRows`. We avoid
// brittleness by re-using a typed builder spy. Used by the in-route lookupPortfolioToken +
// the disconnect's delete-returning chain.
let lookupTokenRows: Array<{ access_token: string | null; providerAccountId: string }> = [];
let deleteReturningRows: Array<{ id: string }> = [];

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    getEpisodeForPush: (...a: Parameters<typeof actual.getEpisodeForPush>) =>
      getEpisodeForPush(...a),
    getPortfolioSettings: (...a: Parameters<typeof actual.getPortfolioSettings>) =>
      getPortfolioSettings(...a),
    listRecentPushes: (...a: Parameters<typeof actual.listRecentPushes>) =>
      listRecentPushes(...a),
    recordPush: (...a: Parameters<typeof actual.recordPush>) => recordPush(...a),
    updatePortfolioSettings: (...a: Parameters<typeof actual.updatePortfolioSettings>) =>
      updatePortfolioSettings(...a),
  };
});

// Hand-rolled fake DB. The route uses `db.select({...}).from(accounts).where(...).limit(1)` to
// look up the token, and `db.delete(accounts).where(...).returning(...)` for disconnect.
const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(lookupTokenRows),
      }),
    }),
  }),
  delete: () => ({
    where: () => ({
      returning: () => Promise.resolve(deleteReturningRows),
    }),
  }),
} as unknown as LearnProDb;

const userSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y` });

const NULL_SESSION: SessionResolver = async () => null;
const USER_ID = "11111111-1111-1111-1111-111111111111";
const EPISODE_ID = "22222222-2222-2222-2222-222222222222";

interface FakeClient {
  ensureRepoExists: ReturnType<typeof vi.fn>;
  pushFile: ReturnType<typeof vi.fn>;
}

function buildApp(opts: {
  sessionResolver?: SessionResolver;
  buildClient?: () => FakeClient;
}) {
  const builder = opts.buildClient ?? (() => fakeClient());
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    portfolio: {
      db: fakeDb,
      webBaseUrl: "https://learnpro.example",
      buildClient: ((_token: string) => builder()) as never,
    },
  });
}

function fakeClient(): FakeClient {
  return {
    ensureRepoExists: vi.fn(async () => ({ created: false })),
    pushFile: vi.fn(async () => ({ commit_sha: "sha-fake" })),
  };
}

beforeEach(() => {
  lookupTokenRows = [];
  deleteReturningRows = [];
  getEpisodeForPush.mockReset();
  getPortfolioSettings.mockReset().mockResolvedValue({
    github_portfolio_repo: null,
    github_auto_push_enabled: false,
  });
  listRecentPushes.mockReset().mockResolvedValue([]);
  recordPush.mockReset();
  updatePortfolioSettings.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/portfolio/state", () => {
  it("401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/portfolio/state" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns connected:false when no portfolio account row exists", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    lookupTokenRows = [];
    const res = await app.inject({ method: "GET", url: "/v1/portfolio/state" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      connected: false,
      repo: "learnpro-portfolio",
      auto_push: false,
      recent_pushes: [],
    });
    await app.close();
  });

  it("returns connected:true + repo + recent pushes when an account row exists", async () => {
    lookupTokenRows = [{ access_token: "ghu_xxx", providerAccountId: "octocat" }];
    getPortfolioSettings.mockResolvedValueOnce({
      github_portfolio_repo: "my-portfolio",
      github_auto_push_enabled: true,
    });
    listRecentPushes.mockResolvedValueOnce([
      {
        id: "p1",
        episode_id: EPISODE_ID,
        repo_owner: "octocat",
        repo_name: "my-portfolio",
        directory_path: "py/two-sum",
        commit_sha: "sha1",
        pushed_at: new Date("2026-05-01T10:00:00Z"),
        auto: false,
      },
    ]);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/portfolio/state" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { connected: boolean; repo: string; recent_pushes: unknown[] };
    expect(body.connected).toBe(true);
    expect(body.repo).toBe("my-portfolio");
    expect(body.recent_pushes).toHaveLength(1);
    await app.close();
  });
});

describe("POST /v1/portfolio/connect-init", () => {
  it("401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "POST", url: "/v1/portfolio/connect-init" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the absolute apps/web start URL", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "POST", url: "/v1/portfolio/connect-init" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      start_url: "https://learnpro.example/api/portfolio/oauth/start",
    });
    await app.close();
  });
});

describe("POST /v1/portfolio/disconnect", () => {
  it("401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "POST", url: "/v1/portfolio/disconnect" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns ok + count on a successful delete", async () => {
    deleteReturningRows = [{ id: "octocat" }];
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "POST", url: "/v1/portfolio/disconnect" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, deleted: 1 });
    await app.close();
  });

  it("returns ok + 0 when no row to delete (idempotent)", async () => {
    deleteReturningRows = [];
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "POST", url: "/v1/portfolio/disconnect" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, deleted: 0 });
    await app.close();
  });
});

describe("PUT /v1/portfolio/settings", () => {
  it("401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "PUT",
      url: "/v1/portfolio/settings",
      payload: { auto_push: true },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("400 when both fields are missing", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/portfolio/settings",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("400 when repo contains illegal characters", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/portfolio/settings",
      payload: { repo: "bad name with spaces" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("flips the auto_push toggle and returns the updated settings", async () => {
    updatePortfolioSettings.mockResolvedValueOnce({
      github_portfolio_repo: null,
      github_auto_push_enabled: true,
    });
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/portfolio/settings",
      payload: { auto_push: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ repo: "learnpro-portfolio", auto_push: true });
    expect(updatePortfolioSettings).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID, auto_push: true }),
    );
    await app.close();
  });
});

describe("POST /v1/portfolio/push", () => {
  it("401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "POST",
      url: "/v1/portfolio/push",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("400 on a malformed body (non-uuid episode_id)", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/portfolio/push",
      payload: { episode_id: "not-a-uuid" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("409 not_connected when no portfolio account row", async () => {
    lookupTokenRows = [];
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/portfolio/push",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "not_connected" });
    await app.close();
  });

  it("404 when the episode doesn't exist (or doesn't belong to the user)", async () => {
    lookupTokenRows = [{ access_token: "ghu_xxx", providerAccountId: "octocat" }];
    getEpisodeForPush.mockResolvedValueOnce(null);
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/portfolio/push",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("409 not_passing when the latest submission didn't pass", async () => {
    lookupTokenRows = [{ access_token: "ghu_xxx", providerAccountId: "octocat" }];
    getEpisodeForPush.mockResolvedValueOnce({
      episode: { id: EPISODE_ID, user_id: USER_ID, problem_id: "p1", final_outcome: "failed" },
      problem: {
        id: "p1",
        name: "Two Sum",
        slug: "two-sum",
        statement: "...",
        language: "python",
      },
      track: { name: "Python fundamentals", slug: "python-fundamentals" },
      submission: { code: "x = 1", passed: false },
    });
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "POST",
      url: "/v1/portfolio/push",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "not_passing" });
    await app.close();
  });

  it("happy path: writes README + code, persists row, returns commit_sha", async () => {
    lookupTokenRows = [{ access_token: "ghu_xxx", providerAccountId: "octocat" }];
    getEpisodeForPush.mockResolvedValueOnce({
      episode: { id: EPISODE_ID, user_id: USER_ID, problem_id: "p1", final_outcome: "passed" },
      problem: {
        id: "p1",
        name: "Two Sum",
        slug: "two-sum",
        statement: "Find two indices.",
        language: "python",
      },
      track: { name: "Python fundamentals", slug: "python-fundamentals" },
      submission: { code: "def two_sum():\n    return [0, 1]", passed: true },
    });
    const recordedAt = new Date("2026-05-01T12:00:00Z");
    recordPush.mockResolvedValueOnce({
      id: "row1",
      episode_id: EPISODE_ID,
      pushed_at: recordedAt,
      directory_path: "python-fundamentals/two-sum",
      commit_sha: "code_sha",
    });
    const client = fakeClient();
    client.ensureRepoExists.mockResolvedValue({ created: true });
    client.pushFile
      .mockResolvedValueOnce({ commit_sha: "readme_sha" })
      .mockResolvedValueOnce({ commit_sha: "code_sha" });
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      buildClient: () => client,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/portfolio/push",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body["repo_created"]).toBe(true);
    expect(body["directory_path"]).toBe("python-fundamentals/two-sum");
    expect(body["commit_sha"]).toBe("code_sha");
    expect(body["readme_commit_sha"]).toBe("readme_sha");
    expect(body["html_url"]).toBe(
      "https://github.com/octocat/learnpro-portfolio/tree/HEAD/python-fundamentals/two-sum",
    );
    // Two pushFile calls: README first, then code.
    expect(client.pushFile).toHaveBeenCalledTimes(2);
    const readmeCall = client.pushFile.mock.calls[0];
    if (!readmeCall) throw new Error("pushFile not called");
    expect(readmeCall[2]).toBe("python-fundamentals/two-sum/README.md");
    expect(readmeCall[3]).toContain("# Two Sum");
    const codeCall = client.pushFile.mock.calls[1];
    if (!codeCall) throw new Error("pushFile not called twice");
    expect(codeCall[2]).toBe("python-fundamentals/two-sum/solution.py");
    expect(recordPush).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        episode_id: EPISODE_ID,
        repo_owner: "octocat",
        directory_path: "python-fundamentals/two-sum",
        commit_sha: "code_sha",
        auto: false,
      }),
    );
    await app.close();
  });

  it("uses the user-supplied edit_readme verbatim instead of generating one", async () => {
    lookupTokenRows = [{ access_token: "ghu_xxx", providerAccountId: "octocat" }];
    getEpisodeForPush.mockResolvedValueOnce({
      episode: { id: EPISODE_ID, user_id: USER_ID, problem_id: "p1", final_outcome: "passed" },
      problem: {
        id: "p1",
        name: "Two Sum",
        slug: "two-sum",
        statement: "...",
        language: "python",
      },
      track: { name: "Python", slug: "python" },
      submission: { code: "code", passed: true },
    });
    recordPush.mockResolvedValueOnce({
      id: "row1",
      episode_id: EPISODE_ID,
      pushed_at: new Date(),
      directory_path: "python/two-sum",
      commit_sha: "sha",
    });
    const client = fakeClient();
    client.pushFile
      .mockResolvedValueOnce({ commit_sha: "rsha" })
      .mockResolvedValueOnce({ commit_sha: "csha" });
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      buildClient: () => client,
    });
    const customReadme = "# Custom title\n\nMy own words.\n";
    await app.inject({
      method: "POST",
      url: "/v1/portfolio/push",
      payload: { episode_id: EPISODE_ID, edit_readme: customReadme },
    });
    const readmeCall = client.pushFile.mock.calls[0];
    if (!readmeCall) throw new Error("pushFile not called");
    expect(readmeCall[3]).toBe(customReadme);
    await app.close();
  });

  it("re-push uses the same recordPush UPSERT path (idempotent on user_id+episode_id)", async () => {
    lookupTokenRows = [{ access_token: "ghu_xxx", providerAccountId: "octocat" }];
    getEpisodeForPush.mockResolvedValue({
      episode: { id: EPISODE_ID, user_id: USER_ID, problem_id: "p1", final_outcome: "passed" },
      problem: {
        id: "p1",
        name: "Two Sum",
        slug: "two-sum",
        statement: "...",
        language: "python",
      },
      track: { name: "Python", slug: "python" },
      submission: { code: "code", passed: true },
    });
    recordPush.mockResolvedValue({
      id: "row1",
      episode_id: EPISODE_ID,
      pushed_at: new Date(),
      directory_path: "python/two-sum",
      commit_sha: "csha2",
    });
    const client = fakeClient();
    client.pushFile.mockResolvedValue({ commit_sha: "x" });
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      buildClient: () => client,
    });
    await app.inject({
      method: "POST",
      url: "/v1/portfolio/push",
      payload: { episode_id: EPISODE_ID },
    });
    await app.inject({
      method: "POST",
      url: "/v1/portfolio/push",
      payload: { episode_id: EPISODE_ID },
    });
    expect(recordPush).toHaveBeenCalledTimes(2);
    // Both calls hit recordPush — the ON CONFLICT DO UPDATE happens at the SQL layer.
    await app.close();
  });

  it("403 github_token_invalid when the GitHub client returns 401", async () => {
    lookupTokenRows = [{ access_token: "ghu_xxx", providerAccountId: "octocat" }];
    getEpisodeForPush.mockResolvedValueOnce({
      episode: { id: EPISODE_ID, user_id: USER_ID, problem_id: "p1", final_outcome: "passed" },
      problem: {
        id: "p1",
        name: "Two Sum",
        slug: "two-sum",
        statement: "...",
        language: "python",
      },
      track: { name: "Python", slug: "python" },
      submission: { code: "code", passed: true },
    });
    const { GitHubPortfolioError } = await import("@learnpro/portfolio");
    const client = fakeClient();
    client.ensureRepoExists.mockRejectedValueOnce(
      new GitHubPortfolioError("ensureRepoExists.get failed (HTTP 401)", 401, "Bad creds"),
    );
    const app = buildApp({
      sessionResolver: userSession(USER_ID),
      buildClient: () => client,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/portfolio/push",
      payload: { episode_id: EPISODE_ID },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: "github_token_invalid" });
    await app.close();
  });
});
