import * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveTrackSlugs } from "@learnpro/db";
import { auth } from "../../auth/auth.js";
import { getAuthDb } from "../../auth/db.js";
import { PlanClient } from "./PlanClient.js";
import type { TodayPlanShape } from "./plan-view.js";

void React;

// STORY-046 — `/plan` page. Server component; auth-gated. Loads today's plan from the
// /api/today-plan proxy (which forwards the cookie to Fastify) and hands the snapshot to the
// `<PlanClient>` for the re-plan + reasoning toggle interactions.
//
// Weekly view is intentionally a stub explaining the deferral to STORY-046b (post-STORY-032
// knowledge graph). We do NOT fake the weekly content.

export const dynamic = "force-dynamic";

interface TodayPlanPayload {
  today_plan: TodayPlanShape;
}

async function loadTodayPlan(): Promise<TodayPlanShape | null> {
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  const host = incoming.get("host") ?? "localhost:3000";
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/api/today-plan`;
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
  const json = (await res.json().catch(() => null)) as TodayPlanPayload | null;
  return json?.today_plan ?? null;
}

export default async function PlanPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const db = getAuthDb();
  const [plan, activeTrackSlugs] = await Promise.all([
    loadTodayPlan(),
    getActiveTrackSlugs(db, session.user.id),
  ]);
  const activeTrackSlug = activeTrackSlugs[0] ?? null;

  return (
    <main
      id="main-content"
      style={{
        padding: "1.25rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.6rem" }}>Your plan</h1>
        <p style={{ margin: "0.4rem 0 0", color: "#555", fontSize: "0.95rem" }}>
          Today&apos;s focus: a short review queue plus the session plan you&apos;re working on.
        </p>
      </header>
      <PlanClient initialPlan={plan} activeTrackSlug={activeTrackSlug} />
    </main>
  );
}
