import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// Browser → Next.js → Fastify proxy for the session-plan API. GET returns the latest active plan
// (or null) for the authenticated user; POST creates a new one (idempotent within the active
// window). Forwards the Auth.js session cookie so apps/api can resolve the user.

async function proxy(method: "GET" | "POST"): Promise<NextResponse> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/session-plan`, {
      method,
      headers: {
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "api_unreachable",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(): Promise<NextResponse> {
  return proxy("GET");
}

export async function POST(): Promise<NextResponse> {
  return proxy("POST");
}
