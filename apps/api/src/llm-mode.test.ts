import type { LearnProDb } from "@learnpro/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";
import type { SessionResolver } from "./session.js";

// STORY-036 — covers GET / PUT /v1/settings/llm-mode + auth gating + invalid-request handling.

const getTutorMode = vi.fn();
const updateTutorMode = vi.fn();

vi.mock("@learnpro/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@learnpro/db")>();
  return {
    ...actual,
    getTutorMode: (...a: Parameters<typeof actual.getTutorMode>) => getTutorMode(...a),
    updateTutorMode: (...a: Parameters<typeof actual.updateTutorMode>) => updateTutorMode(...a),
  };
});

const fakeDb = {} as unknown as LearnProDb;
const NULL_SESSION: SessionResolver = async () => null;
const USER_ID = "11111111-1111-1111-1111-111111111111";
const userSession =
  (user_id: string): SessionResolver =>
  async () => ({ user_id, org_id: "self", email: `${user_id}@x.y` });

function buildApp(opts: { sessionResolver?: SessionResolver } = {}) {
  return buildServer({
    sessionResolver: opts.sessionResolver ?? NULL_SESSION,
    llmModeDb: fakeDb,
  });
}

beforeEach(() => {
  getTutorMode.mockReset().mockResolvedValue("cloud");
  updateTutorMode.mockReset().mockImplementation(async ({ mode }) => mode);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /v1/settings/llm-mode (STORY-036)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({ method: "GET", url: "/v1/settings/llm-mode" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the user's tutor mode + the operator-configured Ollama target (200)", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({ method: "GET", url: "/v1/settings/llm-mode" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe("cloud");
    expect(typeof body.ollama_base_url).toBe("string");
    expect(typeof body.ollama_model).toBe("string");
    expect(getTutorMode).toHaveBeenCalledWith(fakeDb, USER_ID);
    await app.close();
  });
});

describe("PUT /v1/settings/llm-mode (STORY-036)", () => {
  it("returns 401 when no session", async () => {
    const app = buildApp({});
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/llm-mode",
      payload: { mode: "local" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 on a malformed body", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/llm-mode",
      payload: { mode: "hybrid" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 200 + persists via updateTutorMode on a valid body", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/settings/llm-mode",
      payload: { mode: "auto-fallback" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().mode).toBe("auto-fallback");
    expect(updateTutorMode).toHaveBeenCalledWith({
      db: fakeDb,
      user_id: USER_ID,
      org_id: "self",
      mode: "auto-fallback",
    });
    await app.close();
  });

  it("accepts each of the three documented modes", async () => {
    const app = buildApp({ sessionResolver: userSession(USER_ID) });
    for (const mode of ["cloud", "local", "auto-fallback"] as const) {
      const res = await app.inject({
        method: "PUT",
        url: "/v1/settings/llm-mode",
        payload: { mode },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().mode).toBe(mode);
    }
    await app.close();
  });
});
