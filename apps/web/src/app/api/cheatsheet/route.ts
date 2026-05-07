import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// STORY-041 — Next.js Route Handler that proxies the apps/api cheatsheet endpoints behind
// the same-origin /api/cheatsheet path. The handler forwards the session cookie so the
// apps/api session resolver can identify the user; everything else (auth, validation,
// persistence) lives upstream.
//
// Resource shape mapping:
//   GET    /api/cheatsheet?limit=&offset=          -> GET    /v1/cheatsheets
//   POST   /api/cheatsheet                          -> POST   /v1/cheatsheets       (generate)
//   GET    /api/cheatsheet?id=<uuid>                -> GET    /v1/cheatsheets/<uuid>
//   PUT    /api/cheatsheet?id=<uuid>                -> PUT    /v1/cheatsheets/<uuid>
//   POST   /api/cheatsheet?id=<uuid>&action=export  -> POST   /v1/cheatsheets/<uuid>/export

function apiBase(): string {
  return process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
}

async function forwardCookie(): Promise<string> {
  const incoming = await headers();
  return incoming.get("cookie") ?? "";
}

function unreachable(err: unknown): Response {
  return NextResponse.json(
    { error: "api_unreachable", message: err instanceof Error ? err.message : String(err) },
    { status: 502 },
  );
}

function relayResponse(upstream: Response, body: string): Response {
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      ...(upstream.headers.get("content-disposition")
        ? { "content-disposition": upstream.headers.get("content-disposition") ?? "" }
        : {}),
    },
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const cookie = await forwardCookie();
  const target = id
    ? `${apiBase()}/v1/cheatsheets/${encodeURIComponent(id)}`
    : `${apiBase()}/v1/cheatsheets${url.search ? url.search : ""}`;
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "GET",
      headers: { ...(cookie ? { cookie } : {}) },
    });
  } catch (err) {
    return unreachable(err);
  }
  const body = await upstream.text();
  return relayResponse(upstream, body);
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const action = url.searchParams.get("action");
  const cookie = await forwardCookie();
  const target = id
    ? action === "export"
      ? `${apiBase()}/v1/cheatsheets/${encodeURIComponent(id)}/export`
      : `${apiBase()}/v1/cheatsheets/${encodeURIComponent(id)}`
    : `${apiBase()}/v1/cheatsheets`;
  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body.length > 0 ? body : "{}",
    });
  } catch (err) {
    return unreachable(err);
  }
  const text = await upstream.text();
  return relayResponse(upstream, text);
}

export async function PUT(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "invalid_request", message: "id query param required" },
      { status: 400 },
    );
  }
  const cookie = await forwardCookie();
  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await fetch(`${apiBase()}/v1/cheatsheets/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: body.length > 0 ? body : "{}",
    });
  } catch (err) {
    return unreachable(err);
  }
  const text = await upstream.text();
  return relayResponse(upstream, text);
}
