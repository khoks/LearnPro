import { describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  buildClearStateCookie,
  buildRedirectUri,
  buildStateCookie,
  exchangeCodeForToken,
  fetchGithubUser,
  PORTFOLIO_OAUTH_SCOPE,
  PORTFOLIO_STATE_COOKIE,
  PORTFOLIO_STATE_TTL_MS,
  readEnvOrThrow,
  readStateCookie,
  signState,
  verifyState,
} from "./oauth.js";

const SECRET = "test-secret-not-real";

describe("readEnvOrThrow", () => {
  it("throws when GITHUB_CLIENT_ID is missing", () => {
    expect(() =>
      readEnvOrThrow({
        GITHUB_CLIENT_SECRET: "x",
        NEXTAUTH_SECRET: "y",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/GITHUB_CLIENT_ID/);
  });

  it("throws when GITHUB_CLIENT_SECRET is missing", () => {
    expect(() =>
      readEnvOrThrow({
        GITHUB_CLIENT_ID: "x",
        NEXTAUTH_SECRET: "y",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/GITHUB_CLIENT_SECRET/);
  });

  it("throws when NEXTAUTH_SECRET is missing", () => {
    expect(() =>
      readEnvOrThrow({
        GITHUB_CLIENT_ID: "x",
        GITHUB_CLIENT_SECRET: "y",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/NEXTAUTH_SECRET/);
  });

  it("returns the env when all 3 are set", () => {
    const out = readEnvOrThrow({
      GITHUB_CLIENT_ID: "id",
      GITHUB_CLIENT_SECRET: "secret",
      NEXTAUTH_SECRET: "hmac-key",
      NEXTAUTH_URL: "http://localhost:3000",
    } as unknown as NodeJS.ProcessEnv);
    expect(out.GITHUB_CLIENT_ID).toBe("id");
    expect(out.NEXTAUTH_URL).toBe("http://localhost:3000");
  });
});

describe("buildRedirectUri", () => {
  it("uses PORTFOLIO_OAUTH_REDIRECT_BASE when set", () => {
    expect(
      buildRedirectUri({
        GITHUB_CLIENT_ID: "x",
        GITHUB_CLIENT_SECRET: "x",
        NEXTAUTH_SECRET: "x",
        PORTFOLIO_OAUTH_REDIRECT_BASE: "https://learnpro.example",
      }),
    ).toBe("https://learnpro.example/api/portfolio/oauth/callback");
  });

  it("falls back to NEXTAUTH_URL when PORTFOLIO_OAUTH_REDIRECT_BASE is unset", () => {
    expect(
      buildRedirectUri({
        GITHUB_CLIENT_ID: "x",
        GITHUB_CLIENT_SECRET: "x",
        NEXTAUTH_SECRET: "x",
        NEXTAUTH_URL: "https://learnpro.example/",
      }),
    ).toBe("https://learnpro.example/api/portfolio/oauth/callback");
  });

  it("falls back to localhost when neither base is set", () => {
    expect(
      buildRedirectUri({
        GITHUB_CLIENT_ID: "x",
        GITHUB_CLIENT_SECRET: "x",
        NEXTAUTH_SECRET: "x",
      }),
    ).toBe("http://localhost:3000/api/portfolio/oauth/callback");
  });
});

describe("signState / verifyState", () => {
  it("round-trips a valid state token", () => {
    const state = signState({ user_id: "u-123", secret: SECRET });
    const out = verifyState({ state, secret: SECRET });
    expect(out?.user_id).toBe("u-123");
  });

  it("rejects a state token with a tampered payload (signature mismatch)", () => {
    const state = signState({ user_id: "u-123", secret: SECRET });
    const [body, sig] = state.split(".");
    // Flip a base64 char to corrupt the body without changing length.
    const corrupted = `${(body ?? "").replace(/A/, "B").replace(/^([^B])/, "B")}.${sig}`;
    expect(verifyState({ state: corrupted, secret: SECRET })).toBeNull();
  });

  it("rejects a state token signed with a different secret", () => {
    const state = signState({ user_id: "u-123", secret: SECRET });
    expect(verifyState({ state, secret: "different-secret" })).toBeNull();
  });

  it("rejects a state token without two parts", () => {
    expect(verifyState({ state: "no-dot", secret: SECRET })).toBeNull();
    expect(verifyState({ state: "", secret: SECRET })).toBeNull();
  });

  it("rejects an expired state token (past TTL)", () => {
    const past = Date.now() - PORTFOLIO_STATE_TTL_MS - 1000;
    const state = signState({ user_id: "u-123", secret: SECRET, now: past });
    expect(verifyState({ state, secret: SECRET })).toBeNull();
  });

  it("rejects a clearly-future state token (clock-skew defense)", () => {
    const future = Date.now() + 5 * 60 * 1000;
    const state = signState({ user_id: "u-123", secret: SECRET, now: future });
    expect(verifyState({ state, secret: SECRET })).toBeNull();
  });

  it("emits distinct state tokens for two same-second calls (nonce)", () => {
    const a = signState({ user_id: "u-123", secret: SECRET, now: 1000 });
    const b = signState({ user_id: "u-123", secret: SECRET, now: 1000 });
    expect(a).not.toBe(b);
  });
});

describe("buildAuthorizeUrl", () => {
  it("includes client_id, redirect_uri, state, default scope (repo), and allow_signup=false", () => {
    const url = buildAuthorizeUrl({
      client_id: "abc",
      redirect_uri: "https://learnpro.example/api/portfolio/oauth/callback",
      state: "my-state",
    });
    expect(url).toContain("client_id=abc");
    expect(url).toContain("scope=repo");
    expect(url).toContain("state=my-state");
    expect(url).toContain("allow_signup=false");
    expect(url).toContain(
      "redirect_uri=https%3A%2F%2Flearnpro.example%2Fapi%2Fportfolio%2Foauth%2Fcallback",
    );
  });

  it("respects an explicit scope override", () => {
    const url = buildAuthorizeUrl({
      client_id: "abc",
      redirect_uri: "https://x.test/cb",
      state: "s",
      scope: "repo public_repo",
    });
    // URLSearchParams encodes ' ' as '+', which GitHub treats as a space — confirm both.
    const parsed = new URL(url);
    expect(parsed.searchParams.get("scope")).toBe("repo public_repo");
  });

  it("uses the literal 'repo' scope as the default (matches PORTFOLIO_OAUTH_SCOPE)", () => {
    expect(PORTFOLIO_OAUTH_SCOPE).toBe("repo");
  });
});

describe("state cookie helpers", () => {
  it("buildStateCookie sets HttpOnly + SameSite=Lax + Path scoped to OAuth + Max-Age", () => {
    const c = buildStateCookie("my-state");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/api/portfolio/oauth");
    expect(c).toContain(`${PORTFOLIO_STATE_COOKIE}=my-state`);
    expect(c).toMatch(/Max-Age=\d+/);
  });

  it("buildClearStateCookie sets Max-Age=0 to drop the cookie", () => {
    const c = buildClearStateCookie();
    expect(c).toContain("Max-Age=0");
  });

  it("readStateCookie returns null when the header is missing", () => {
    expect(readStateCookie(null)).toBeNull();
    expect(readStateCookie("")).toBeNull();
    expect(readStateCookie("other=foo")).toBeNull();
  });

  it("readStateCookie pulls the state value out of a multi-cookie header", () => {
    expect(readStateCookie(`other=x; ${PORTFOLIO_STATE_COOKIE}=abc.def; another=y`)).toBe(
      "abc.def",
    );
  });
});

describe("exchangeCodeForToken", () => {
  it("POSTs the code and returns access_token + scope + token_type on success", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain("github.com/login/oauth/access_token");
      const body = JSON.parse((init?.body ?? "{}") as string) as Record<string, unknown>;
      expect(body["client_id"]).toBe("id");
      expect(body["client_secret"]).toBe("secret");
      expect(body["code"]).toBe("abc");
      return new Response(
        JSON.stringify({ access_token: "ghu_xxx", scope: "repo", token_type: "bearer" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const out = await exchangeCodeForToken({
      code: "abc",
      env: {
        GITHUB_CLIENT_ID: "id",
        GITHUB_CLIENT_SECRET: "secret",
        NEXTAUTH_SECRET: "hmac",
      },
      redirect_uri: "https://x.test/cb",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.access_token).toBe("ghu_xxx");
    expect(out.scope).toBe("repo");
  });

  it("throws when GitHub returns an error JSON shape", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "bad_verification_code" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      exchangeCodeForToken({
        code: "abc",
        env: {
          GITHUB_CLIENT_ID: "id",
          GITHUB_CLIENT_SECRET: "secret",
          NEXTAUTH_SECRET: "hmac",
        },
        redirect_uri: "https://x.test/cb",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/bad_verification_code/);
  });

  it("throws on a non-2xx HTTP response", async () => {
    const fetchImpl = vi.fn(async () => new Response("Server error", { status: 500 }));
    await expect(
      exchangeCodeForToken({
        code: "abc",
        env: {
          GITHUB_CLIENT_ID: "id",
          GITHUB_CLIENT_SECRET: "secret",
          NEXTAUTH_SECRET: "hmac",
        },
        redirect_uri: "https://x.test/cb",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/oauth_token_exchange_failed_500/);
  });
});

describe("fetchGithubUser", () => {
  it("returns id + login on success", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 42, login: "octocat" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const out = await fetchGithubUser("ghu_xxx", fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ id: 42, login: "octocat" });
  });

  it("throws when the response shape is invalid", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "not-a-number" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(fetchGithubUser("t", fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /oauth_user_lookup_invalid_shape/,
    );
  });

  it("throws on non-2xx HTTP", async () => {
    const fetchImpl = vi.fn(async () => new Response("Bad creds", { status: 401 }));
    await expect(fetchGithubUser("t", fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /oauth_user_lookup_failed_401/,
    );
  });
});
