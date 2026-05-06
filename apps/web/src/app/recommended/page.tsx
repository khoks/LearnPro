import * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../auth/auth.js";

void React;
import {
  RecommendedTracksCard,
  type RecommendedTrackSummary,
  type RoleBias,
} from "./RecommendedTracksCard.js";

// STORY-021 — post-onboarding "Recommended for you" page. Server component; auth-gated. Calls
// the cross-app /api/recommendation proxy so we don't reach into apps/api directly. When the API
// returns a null role (no profile / unknown target_role / un-recommended state), we fall back to
// the dashboard — free choice, no soft-locks (AC #3).
export const dynamic = "force-dynamic";

interface RecommendationPayload {
  role: { slug: string; label: string; bias: RoleBias } | null;
  recommended_tracks: RecommendedTrackSummary[];
  recommended_daily_minutes: number | null;
}

async function loadRecommendation(): Promise<RecommendationPayload | null> {
  // Use the in-process app-base URL — same pattern other server-component pages use to call back
  // through the public Next.js routes. Forward the cookie so the proxy → Fastify hop can resolve
  // the user's session.
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  const host = incoming.get("host") ?? "localhost:3000";
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/api/recommendation`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { ...(cookie ? { cookie } : {}) },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as RecommendationPayload | null;
  return json ?? null;
}

export default async function RecommendedPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const payload = await loadRecommendation();
  if (
    !payload ||
    !payload.role ||
    payload.recommended_tracks.length === 0 ||
    payload.recommended_daily_minutes === null
  ) {
    redirect("/dashboard");
  }

  return (
    <main
      id="main-content"
      style={{
        padding: "1.25rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <RecommendedTracksCard
        roleLabel={payload.role.label}
        bias={payload.role.bias}
        recommendedDailyMinutes={payload.recommended_daily_minutes}
        tracks={payload.recommended_tracks}
      />
    </main>
  );
}
