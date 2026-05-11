import * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../../auth/auth.js";
import { VariantFailuresTable, type VariantFailureRow } from "./VariantFailuresTable.js";

void React;

// STORY-039e — Operator-only admin page showing recent LLM-generated problem-variant
// failures. Strictly read-only (no retry / delete / publish actions). Non-admins are
// redirected to /dashboard. The admin check rides entirely on apps/api's 403 — apps/web
// doesn't read `users.is_admin` directly so we never duplicate the gate.
//
// Pure server-side rendering, no client state. Pagination not exposed in v1 — the default
// /v1/admin/variant-failures limit (50) is enough for an operator inspecting the recent
// failure stream.

export const dynamic = "force-dynamic";

interface VariantFailuresPayload {
  failures: VariantFailureRow[];
  total: number;
}

async function loadVariantFailures(): Promise<{
  payload: VariantFailuresPayload | null;
  status: number;
}> {
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  const host = incoming.get("host") ?? "localhost:3000";
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/api/admin/variant-failures`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { ...(cookie ? { cookie } : {}) },
      cache: "no-store",
    });
  } catch {
    return { payload: null, status: 502 };
  }
  if (!res.ok) {
    return { payload: null, status: res.status };
  }
  const json = (await res.json().catch(() => null)) as VariantFailuresPayload | null;
  return { payload: json, status: res.status };
}

export default async function AdminVariantFailuresPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const { payload, status } = await loadVariantFailures();
  if (status === 403) {
    // Non-admin — fall back to the regular dashboard. Apps/api owns the gate; apps/web just
    // listens for the 403 and redirects.
    redirect("/dashboard");
  }
  if (status === 401) {
    redirect("/auth/signin");
  }

  const failures = payload?.failures ?? [];
  const total = payload?.total ?? 0;

  return (
    <main
      id="main-content"
      style={{
        padding: "1.25rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <VariantFailuresTable failures={failures} total={total} />
    </main>
  );
}
