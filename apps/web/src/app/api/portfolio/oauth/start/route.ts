import { NextResponse } from "next/server";
import { auth } from "../../../../../auth/auth.js";
import {
  buildAuthorizeUrl,
  buildRedirectUri,
  buildStateCookie,
  PORTFOLIO_OAUTH_SCOPE,
  readEnvOrThrow,
  signState,
} from "../../../../../portfolio/oauth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/portfolio/oauth/start
//
// Auth-gated entry into the second OAuth flow that grants the `repo` scope. Auth.js's main
// `github` provider stays unchanged — least-privilege at sign-in. This redirects the user to
// GitHub's authorize URL with state=<HMAC-signed user_id+iat+nonce>, plus the matching value
// in an HttpOnly cookie scoped to the callback path. The callback verifies both copies match
// before swapping the code for a token.
export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(absoluteUrl("/auth/signin"), { status: 302 });
  }

  let env: ReturnType<typeof readEnvOrThrow>;
  try {
    env = readEnvOrThrow();
  } catch (err) {
    return NextResponse.json(
      {
        error: "portfolio_oauth_unconfigured",
        message: err instanceof Error ? err.message : "OAuth not configured",
      },
      { status: 503 },
    );
  }

  const state = signState({ user_id: session.user.id, secret: env.NEXTAUTH_SECRET! });
  const url = buildAuthorizeUrl({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: buildRedirectUri(env),
    state,
    scope: PORTFOLIO_OAUTH_SCOPE,
  });

  const headers = new Headers({ location: url });
  headers.append("set-cookie", buildStateCookie(state));
  return new NextResponse(null, { status: 302, headers });
}

function absoluteUrl(path: string): string {
  const base = process.env["NEXTAUTH_URL"] ?? "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}${path}`;
}
