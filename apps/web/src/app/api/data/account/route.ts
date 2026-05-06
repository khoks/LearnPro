import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// STORY-056 — proxy for DELETE /v1/data/account. The upstream Set-Cookie response invalidates
// the session cookie; we forward all Set-Cookie headers verbatim so the browser drops it too.
export async function DELETE(): Promise<Response> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/data/account`, {
      method: "DELETE",
      headers: { ...(cookie ? { cookie } : {}) },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "api_unreachable", message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
  const body = await upstream.text();
  const responseHeaders = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/json",
  });
  // Forward Set-Cookie verbatim so the browser drops the now-orphaned session cookie.
  for (const [k, v] of upstream.headers.entries()) {
    if (k.toLowerCase() === "set-cookie") responseHeaders.append("set-cookie", v);
  }
  return new NextResponse(body, { status: upstream.status, headers: responseHeaders });
}
