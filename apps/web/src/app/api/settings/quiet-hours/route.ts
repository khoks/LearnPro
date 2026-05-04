import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://localhost:4000";

// Mirrors @learnpro/scoring's QuietHoursConfigSchema, kept inline here so this proxy doesn't pull
// the whole package into the edge bundle. The Fastify endpoint re-validates against the canonical
// schema before persisting — this client-side check is a friendly 400 ahead of the network round-trip.
const ProxyBodySchema = z.object({
  enabled: z.boolean(),
  start_min: z.number().int().min(0).max(1439),
  end_min: z.number().int().min(0).max(1439),
  timezone: z.string().min(1).max(64),
});

export async function GET(): Promise<Response> {
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/settings/quiet-hours`, {
      method: "GET",
      headers: { ...(cookie ? { cookie } : {}) },
    });
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

export async function PUT(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  const parsed = ProxyBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const apiUrl = process.env["LEARNPRO_API_URL"] ?? DEFAULT_API_URL;
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}/v1/settings/quiet-hours`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(parsed.data),
    });
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
