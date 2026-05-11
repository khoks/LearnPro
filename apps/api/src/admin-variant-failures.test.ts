import type { LearnProDb } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

// STORY-039e — admin failed-gate variant inspection. Read-only, gated on
// `users.is_admin = true`. The route mounts only when `adminVariantFailuresDb` is supplied.

const listVariantGateFailures = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    listVariantGateFailures: (...a: Parameters<typeof actual.listVariantGateFailures>) =>
      listVariantGateFailures(...a),
  };
});

const fakeDb = {} as unknown as LearnProDb;

const adminSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y`, is_admin: true });

const nonAdminSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y`, is_admin: false });

const NULL_SESSION: SessionResolver = async () => null;
const ADMIN_USER_ID = "22222222-2222-4222-8222-222222222222";
const NORMAL_USER_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_PROBLEM_ID = "44444444-4444-4444-8444-444444444444";

function buildApp(opts: { sessionResolver?: SessionResolver; surfaceWired?: boolean }) {
  const wired = opts.surfaceWired !== false;
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    ...(wired ? { adminVariantFailuresDb: fakeDb } : {}),
  });
}

beforeEach(() => {
  listVariantGateFailures.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/admin/variant-failures (STORY-039e)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/admin/variant-failures" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("unauthorized");
    await app.close();
  });

  it("returns 403 when the user is authed but not an admin", async () => {
    const app = buildApp({ sessionResolver: nonAdminSession(NORMAL_USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/admin/variant-failures" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("forbidden");
    expect(listVariantGateFailures).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 200 with failures payload when an admin requests it", async () => {
    listVariantGateFailures.mockResolvedValue({
      failures: [
        {
          id: "f-1",
          org_id: "self",
          source_problem_id: SOURCE_PROBLEM_ID,
          source_problem_slug: "sum-even-numbers",
          attempted_at: new Date("2026-05-10T10:00:00Z"),
          failure_reason: "parse_error",
          failure_detail: { reason: "invalid_json", error: "unexpected token at position 0" },
          model_id: "claude-haiku-4",
          attempt_number: 1,
        },
      ],
      total: 1,
    });
    const app = buildApp({ sessionResolver: adminSession(ADMIN_USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/admin/variant-failures" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0]).toMatchObject({
      id: "f-1",
      source_problem_id: SOURCE_PROBLEM_ID,
      source_problem_slug: "sum-even-numbers",
      failure_reason: "parse_error",
      model_id: "claude-haiku-4",
      attempt_number: 1,
    });
    expect(body.failures[0].attempted_at).toBe("2026-05-10T10:00:00.000Z");
    expect(body.total).toBe(1);
    await app.close();
  });

  it("filters by source_problem_id and passes it through to the DB helper", async () => {
    listVariantGateFailures.mockResolvedValue({ failures: [], total: 0 });
    const app = buildApp({ sessionResolver: adminSession(ADMIN_USER_ID) });
    await app.inject({
      method: "GET",
      url: `/v1/admin/variant-failures?source_problem_id=${SOURCE_PROBLEM_ID}`,
    });
    expect(listVariantGateFailures).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ source_problem_id: SOURCE_PROBLEM_ID }),
    );
    await app.close();
  });

  it("paginates via limit + offset query params", async () => {
    listVariantGateFailures.mockResolvedValue({ failures: [], total: 100 });
    const app = buildApp({ sessionResolver: adminSession(ADMIN_USER_ID) });
    await app.inject({
      method: "GET",
      url: "/v1/admin/variant-failures?limit=25&offset=50",
    });
    expect(listVariantGateFailures).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ limit: 25, offset: 50 }),
    );
    await app.close();
  });

  it("returns 400 on invalid source_problem_id (not a uuid)", async () => {
    const app = buildApp({ sessionResolver: adminSession(ADMIN_USER_ID) });
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/variant-failures?source_problem_id=not-a-uuid",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
    await app.close();
  });

  it("returns 400 on out-of-range limit (>200)", async () => {
    const app = buildApp({ sessionResolver: adminSession(ADMIN_USER_ID) });
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/variant-failures?limit=500",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 when adminVariantFailuresDb is NOT supplied (graceful degrade)", async () => {
    const app = buildApp({
      sessionResolver: adminSession(ADMIN_USER_ID),
      surfaceWired: false,
    });
    const res = await app.inject({ method: "GET", url: "/v1/admin/variant-failures" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("never mutates — only GET is supported on the route", async () => {
    const app = buildApp({ sessionResolver: adminSession(ADMIN_USER_ID) });
    const post = await app.inject({ method: "POST", url: "/v1/admin/variant-failures" });
    expect([404, 405]).toContain(post.statusCode);
    const del = await app.inject({ method: "DELETE", url: "/v1/admin/variant-failures" });
    expect([404, 405]).toContain(del.statusCode);
    await app.close();
  });

  it("empty result still returns 200 with total=0", async () => {
    listVariantGateFailures.mockResolvedValue({ failures: [], total: 0 });
    const app = buildApp({ sessionResolver: adminSession(ADMIN_USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/admin/variant-failures" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ failures: [], total: 0 });
    await app.close();
  });
});
