// STORY-040 — second-OAuth-flow helpers for the GitHub portfolio scope grant.
//
// Why not extend NextAuth? The auth-only `github` provider intentionally requests no scopes
// — least-privilege at sign-in. Bumping its scope to include `repo` would force every signed-
// in user to re-grant elevated permissions just to log in. So we run a *separate* OAuth flow
// that's opt-in: clicking "Connect GitHub portfolio" in /settings/portfolio kicks off this
// flow, GitHub redirects back to /api/portfolio/oauth/callback with a code, and we persist the
// elevated-scope token in the `accounts` table under provider="github-portfolio".

import crypto from "node:crypto";

export const PORTFOLIO_PROVIDER_ID = "github-portfolio";
export const PORTFOLIO_OAUTH_SCOPE = "repo";
export const PORTFOLIO_STATE_COOKIE = "lp_portfolio_oauth_state";

// 10 minutes — long enough that a slow user can hit Authorize, short enough that a stolen
// cookie is useless after lunch.
export const PORTFOLIO_STATE_TTL_MS = 10 * 60 * 1000;

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";

export interface PortfolioOAuthEnv {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  // Authoritative URL the user's browser sees as the apps/web origin. Used to construct the
  // redirect_uri so it exactly matches the value GitHub has on file in the OAuth app config.
  // Falls back to NEXTAUTH_URL because that's set in every existing dev/prod deployment.
  PORTFOLIO_OAUTH_REDIRECT_BASE?: string;
  NEXTAUTH_URL?: string;
  // The HMAC secret signing the state token. Reuses NEXTAUTH_SECRET so the operator doesn't
  // need to set yet another env var.
  NEXTAUTH_SECRET?: string;
}

export function readEnvOrThrow(env: NodeJS.ProcessEnv = process.env): PortfolioOAuthEnv {
  const id = env["GITHUB_CLIENT_ID"];
  const secret = env["GITHUB_CLIENT_SECRET"];
  const oauthSecret = env["NEXTAUTH_SECRET"];
  if (!id || !secret) {
    throw new Error(
      "GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET must be set for the portfolio OAuth flow",
    );
  }
  if (!oauthSecret) {
    throw new Error("NEXTAUTH_SECRET must be set for the portfolio OAuth flow (state token HMAC)");
  }
  return {
    GITHUB_CLIENT_ID: id,
    GITHUB_CLIENT_SECRET: secret,
    NEXTAUTH_SECRET: oauthSecret,
    ...(env["PORTFOLIO_OAUTH_REDIRECT_BASE"] !== undefined && {
      PORTFOLIO_OAUTH_REDIRECT_BASE: env["PORTFOLIO_OAUTH_REDIRECT_BASE"],
    }),
    ...(env["NEXTAUTH_URL"] !== undefined && { NEXTAUTH_URL: env["NEXTAUTH_URL"] }),
  };
}

// Derives the absolute redirect_uri the OAuth flow uses. Matches what's registered on the
// GitHub OAuth app side; mismatches are why GitHub returns "redirect_uri mismatch".
export function buildRedirectUri(env: PortfolioOAuthEnv): string {
  const base =
    env.PORTFOLIO_OAUTH_REDIRECT_BASE ?? env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/api/portfolio/oauth/callback`;
}

interface StatePayload {
  // The user_id this state belongs to. The callback re-checks it equals the current session.
  user_id: string;
  // Wall-clock at issue. The callback rejects state older than PORTFOLIO_STATE_TTL_MS.
  iat: number;
  // 16 bytes of entropy so two same-second states for the same user are still distinct.
  nonce: string;
}

// Returns a `<base64url(payload)>.<base64url(hmac-sha256)>` token. The state needs to round-trip
// the user_id (so the callback can re-check it equals the current session) and the issue time
// (so we can expire stale codes). HMAC-SHA256 with NEXTAUTH_SECRET as the key prevents tamper.
export function signState(opts: { user_id: string; secret: string; now?: number }): string {
  const payload: StatePayload = {
    user_id: opts.user_id,
    iat: opts.now ?? Date.now(),
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = hmac(opts.secret, body);
  return `${body}.${sig}`;
}

// Returns the verified payload, or null on tamper / missing parts / stale.
export function verifyState(opts: {
  state: string;
  secret: string;
  ttlMs?: number;
  now?: number;
}): StatePayload | null {
  if (!opts.state || typeof opts.state !== "string") return null;
  const parts = opts.state.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = hmac(opts.secret, body);
  if (!constantTimeEqual(sig, expected)) return null;
  let payload: StatePayload;
  try {
    payload = JSON.parse(base64UrlDecode(body)) as StatePayload;
  } catch {
    return null;
  }
  if (
    typeof payload.user_id !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.nonce !== "string"
  ) {
    return null;
  }
  const ttl = opts.ttlMs ?? PORTFOLIO_STATE_TTL_MS;
  const now = opts.now ?? Date.now();
  if (now - payload.iat > ttl || now < payload.iat - 60_000) {
    return null;
  }
  return payload;
}

export function buildAuthorizeUrl(opts: {
  client_id: string;
  redirect_uri: string;
  state: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.client_id,
    redirect_uri: opts.redirect_uri,
    state: opts.state,
    scope: opts.scope ?? PORTFOLIO_OAUTH_SCOPE,
    allow_signup: "false",
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export function buildStateCookie(state: string): string {
  // HttpOnly + SameSite=Lax — Lax is the right level here: GitHub redirects back to us via a
  // top-level navigation, not a cross-site POST, and SameSite=Strict would drop the cookie on
  // that redirect. Path is scoped to the OAuth callback only.
  const ttlSec = Math.floor(PORTFOLIO_STATE_TTL_MS / 1000);
  return `${PORTFOLIO_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/api/portfolio/oauth; HttpOnly; SameSite=Lax; Max-Age=${ttlSec}`;
}

export function buildClearStateCookie(): string {
  return `${PORTFOLIO_STATE_COOKIE}=; Path=/api/portfolio/oauth; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readStateCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === PORTFOLIO_STATE_COOKIE) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

// Exchanges the OAuth `code` for an access_token. Throws on non-200 or missing access_token.
export async function exchangeCodeForToken(opts: {
  code: string;
  env: PortfolioOAuthEnv;
  redirect_uri: string;
  fetchImpl?: typeof fetch;
}): Promise<{ access_token: string; scope: string; token_type: string }> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const res = await fetchFn(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: opts.env.GITHUB_CLIENT_ID,
      client_secret: opts.env.GITHUB_CLIENT_SECRET,
      code: opts.code,
      redirect_uri: opts.redirect_uri,
    }),
  });
  if (!res.ok) {
    throw new Error(`oauth_token_exchange_failed_${res.status}`);
  }
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };
  if (json.error || !json.access_token) {
    throw new Error(json.error ?? "oauth_token_missing_access_token");
  }
  return {
    access_token: json.access_token,
    scope: json.scope ?? "",
    token_type: json.token_type ?? "bearer",
  };
}

// Looks up the GitHub user (login + numeric id) so we can use `providerAccountId = user.id`
// in the accounts table — matching what NextAuth does on its side.
export async function fetchGithubUser(
  token: string,
  fetchImpl?: typeof fetch,
): Promise<{ id: number; login: string }> {
  const fetchFn = fetchImpl ?? fetch;
  const res = await fetchFn(GITHUB_USER_URL, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "learnpro-portfolio-oauth/0.1",
    },
  });
  if (!res.ok) {
    throw new Error(`oauth_user_lookup_failed_${res.status}`);
  }
  const json = (await res.json().catch(() => ({}))) as {
    id?: number;
    login?: string;
  };
  if (typeof json.id !== "number" || !json.login) {
    throw new Error("oauth_user_lookup_invalid_shape");
  }
  return { id: json.id, login: json.login };
}

function hmac(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

function base64UrlEncode(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64url");
}

function base64UrlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf-8");
}
