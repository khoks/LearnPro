import * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveTrackSlugs } from "@learnpro/db";
import { auth } from "../../auth/auth.js";
import { getAuthDb } from "../../auth/db.js";
import { PlanClient } from "./PlanClient.js";
import type { TodayPlanShape } from "./plan-view.js";
import {
  WeeklyPlanCard,
  type WeeklyPlanLoadResult,
  type WeeklyPlanShape,
} from "../../components/plan/WeeklyPlanCard.js";

void React;

// STORY-046 — `/plan` page. Server component; auth-gated. Loads today's plan from the
// /api/today-plan proxy (which forwards the cookie to Fastify) and hands the snapshot to the
// `<PlanClient>` for the re-plan + reasoning toggle interactions.
//
// STORY-046b — also loads the weekly plan from /api/weekly-plan and hands it to
// `<WeeklyPlanCard>`. The weekly card replaces the prior `<ThisWeekDeferredStub>` now that
// STORY-032's knowledge graph is populated. When the graph isn't seeded for the user's track or
// no track is active, the card surfaces a friendly explainer (we never fake the weekly view).

export const dynamic = "force-dynamic";

interface TodayPlanPayload {
  today_plan: TodayPlanShape;
}

interface WeeklyPlanPayload {
  weekly_plan: WeeklyPlanShape;
  track_slug?: string;
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

async function loadWeeklyPlan(): Promise<WeeklyPlanLoadResult> {
  const incoming = await headers();
  const cookie = incoming.get("cookie") ?? "";
  const host = incoming.get("host") ?? "localhost:3000";
  const proto = incoming.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/api/weekly-plan`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { ...(cookie ? { cookie } : {}) },
      cache: "no-store",
    });
  } catch {
    return {
      status: "error",
      message: "We couldn't reach the planner just now. Try again shortly.",
    };
  }
  if (res.status === 503) {
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    return {
      status: "unavailable",
      message:
        json?.message ??
        "Weekly themes draw on the populated knowledge graph. Once your track has its graph seeded, you'll see a one-week theme here.",
    };
  }
  if (!res.ok) {
    return { status: "error", message: "We couldn't load the weekly plan right now." };
  }
  const json = (await res.json().catch(() => null)) as WeeklyPlanPayload | null;
  if (!json?.weekly_plan) {
    return { status: "error", message: "We couldn't load the weekly plan right now." };
  }
  return {
    status: "ok",
    plan: json.weekly_plan,
    ...(json.track_slug !== undefined && { track_slug: json.track_slug }),
  };
}

export default async function PlanPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const db = getAuthDb();
  const [plan, weekly, activeTrackSlugs] = await Promise.all([
    loadTodayPlan(),
    loadWeeklyPlan(),
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
          Below it, this week&apos;s coherent theme.
        </p>
      </header>
      <PlanClient initialPlan={plan} activeTrackSlug={activeTrackSlug} />
      <div style={{ marginTop: "1.5rem" }}>
        <WeeklyPlanCard initial={weekly} />
      </div>
    </main>
  );
}
