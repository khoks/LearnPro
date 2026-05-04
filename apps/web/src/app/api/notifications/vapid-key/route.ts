import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// Public — no auth, no cookie. Returns the VAPID public key the browser uses to subscribe.
export async function GET(): Promise<Response> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/notifications/vapid-key`, { method: "GET" });
  } catch (err) {
    return NextResponse.json(
      { error: "api_unreachable", message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
