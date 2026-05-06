import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "../../../../../auth/auth.js";
import { getAuthDb } from "../../../../../auth/db.js";
import {
  buildClearStateCookie,
  buildRedirectUri,
  exchangeCodeForToken,
  fetchGithubUser,
  PORTFOLIO_OAUTH_SCOPE,
  readEnvOrThrow,
  readStateCookie,
  verifyState,
} from "../../../../../portfolio/oauth.js";
import { upsertPortfolioAccount } from "../../../../../portfolio/persist.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/portfolio/oauth/callback?code=...&state=...
//
// Handles GitHub's redirect after the user clicks Authorize. Verifies state, swaps the code
// for an access_token, persists the elevated-scope token in the `accounts` table under
// provider="github-portfolio" so the API can use it without ever asking GitHub again. Then
// redirects the user back to /settings/portfolio with a status query string so the page can
// show a coach-voice success / error toast.
export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return redirectTo("/auth/signin", null);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // GitHub sends `?error=access_denied` when the user clicks Cancel. Clear the cookie and bounce
  // back to settings with a "denied" status so the page shows a coach-voice message.
  if (errorParam) {
    return redirectTo("/settings/portfolio?status=denied", buildClearStateCookie());
  }
  if (!code || !state) {
    return redirectTo("/settings/portfolio?status=invalid", buildClearStateCookie());
  }

  let env: ReturnType<typeof readEnvOrThrow>;
  try {
    env = readEnvOrThrow();
  } catch {
    return redirectTo("/settings/portfolio?status=unconfigured", buildClearStateCookie());
  }

  const incoming = await headers();
  const cookieState = readStateCookie(incoming.get("cookie"));
  if (!cookieState || cookieState !== state) {
    return redirectTo("/settings/portfolio?status=state_mismatch", buildClearStateCookie());
  }
  const verified = verifyState({ state, secret: env.NEXTAUTH_SECRET! });
  if (!verified || verified.user_id !== session.user.id) {
    return redirectTo("/settings/portfolio?status=state_mismatch", buildClearStateCookie());
  }

  let token: Awaited<ReturnType<typeof exchangeCodeForToken>>;
  try {
    token = await exchangeCodeForToken({
      code,
      env,
      redirect_uri: buildRedirectUri(env),
    });
  } catch {
    return redirectTo("/settings/portfolio?status=exchange_failed", buildClearStateCookie());
  }

  // Refuse if GitHub came back with a scope that doesn't include `repo` — the user might have
  // edited the URL or a downscoping happened on the GitHub side.
  const grantedScopes = token.scope.split(/[, ]+/).filter(Boolean);
  if (!grantedScopes.includes(PORTFOLIO_OAUTH_SCOPE)) {
    return redirectTo("/settings/portfolio?status=missing_scope", buildClearStateCookie());
  }

  let ghUser: Awaited<ReturnType<typeof fetchGithubUser>>;
  try {
    ghUser = await fetchGithubUser(token.access_token);
  } catch {
    return redirectTo("/settings/portfolio?status=user_lookup_failed", buildClearStateCookie());
  }

  // We store `providerAccountId = login` (rather than the numeric id) on this row so the API's
  // portfolio push routes can use it directly as the GitHub `:owner` URL segment without a
  // second user-lookup. Distinct from NextAuth's auth-only `github` provider which keeps the
  // numeric id — different provider, different conventions, no conflict on the (provider,
  // providerAccountId) PK.
  await upsertPortfolioAccount({
    db: getAuthDb(),
    user_id: session.user.id,
    providerAccountId: ghUser.login,
    access_token: token.access_token,
    scope: token.scope,
    token_type: token.token_type,
  });

  return redirectTo(
    `/settings/portfolio?status=connected&owner=${encodeURIComponent(ghUser.login)}`,
    buildClearStateCookie(),
  );
}

function redirectTo(path: string, clearCookie: string | null): Response {
  const base = process.env["NEXTAUTH_URL"] ?? "http://localhost:3000";
  const target = `${base.replace(/\/+$/, "")}${path}`;
  const responseHeaders = new Headers({ location: target });
  if (clearCookie) responseHeaders.append("set-cookie", clearCookie);
  return new NextResponse(null, { status: 302, headers: responseHeaders });
}
