import {
  countGotHelpEpisodes,
  getActiveTrackSlugs,
  getDueConcepts,
  getStreakSnapshot,
  getTrackProgress,
  getUserXp,
  type TrackProgress,
} from "@learnpro/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../auth/auth.js";
import { getAuthDb } from "../../auth/db.js";
import { destinationForUser } from "../../auth/post-signin.js";
import { AutonomyBandIndicator } from "../../components/autonomy/AutonomyBandIndicator.js";
import { InstallPrompt } from "../../components/pwa/InstallPrompt.js";
import { QuietHoursCard } from "../../components/settings/QuietHoursCard.js";
import { TodayPlanSummaryCard, type TodayPlanShape } from "../plan/plan-view.js";
import { DueReviewsCard, HonestSessionsCard, TrackProgressBar } from "./dashboard-components.js";
import { DashboardCardsRow } from "./DashboardCardsRow.js";
import { DashboardHeader } from "./DashboardHeader.js";

export const dynamic = "force-dynamic";

const MONTHLY_GRACE_CAP = 2;

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  const dest = await destinationForUser(session.user.id);
  if (dest !== "/dashboard") {
    redirect(dest);
  }

  const userId = session.user.id;
  const db = getAuthDb();
  const today = new Date();
  const [xp, streak, activeTrackSlugs, dueReviews, todayPlan, gotHelpCount] = await Promise.all([
    getUserXp(db, userId),
    getStreakSnapshot(db, userId, today, MONTHLY_GRACE_CAP),
    getActiveTrackSlugs(db, userId),
    getDueConcepts(db, userId, today),
    loadTodayPlanForDashboard(),
    countGotHelpEpisodes(db, userId),
  ]);

  const trackProgress = (
    await Promise.all(activeTrackSlugs.map((slug) => getTrackProgress(db, userId, slug)))
  ).filter((p): p is TrackProgress => p !== null);

  // Pick the most-recently-started track for the "Start a session" CTA. Fall back to undefined
  // so the link is rendered without a query param (the /session route picks a default).
  const primaryTrackSlug = activeTrackSlugs[0];
  const sessionHref = primaryTrackSlug
    ? `/session?track=${encodeURIComponent(primaryTrackSlug)}`
    : "/session";

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
      <DashboardHeader email={session.user.email} sessionHref={sessionHref} />

      <InstallPrompt />

      <DashboardCardsRow
        xp={xp}
        streakDays={streak.streakDays}
        graceDaysRemaining={streak.graceDaysRemaining}
        graceDaysUsedThisCheck={streak.graceDaysUsed}
        monthlyGraceCap={MONTHLY_GRACE_CAP}
      />

      <section aria-label="Today's plan" style={{ marginTop: "1.25rem" }}>
        <TodayPlanSummaryCard plan={todayPlan} activeTrackSlug={primaryTrackSlug ?? null} />
      </section>

      {dueReviews.length > 0 ? (
        <section aria-label="Spaced repetition" style={{ marginTop: "1.25rem" }}>
          <DueReviewsCard count={dueReviews.length} activeTrackSlug={primaryTrackSlug ?? null} />
        </section>
      ) : null}

      <section aria-label="Tutor autonomy" style={{ marginTop: "1.25rem" }}>
        <AutonomyBandIndicator />
      </section>

      <section aria-label="Honest sessions" style={{ marginTop: "1.25rem" }}>
        <HonestSessionsCard count={gotHelpCount} />
      </section>

      <section aria-label="Per-track progress" style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Tracks</h2>
        {trackProgress.length === 0 ? (
          <p style={{ color: "#666" }}>
            You haven&apos;t started a track yet. Click <em>Start a session</em> to begin.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {trackProgress.map((tp) => (
              <TrackProgressBar
                key={tp.track_slug}
                trackName={tp.track_name}
                trackSlug={tp.track_slug}
                language={tp.language}
                mastered={tp.mastered}
                total={tp.total}
                ratio={tp.ratio}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Settings" style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Settings</h2>
        <QuietHoursCard />
      </section>

      <SignOutButton />
    </main>
  );
}

async function loadTodayPlanForDashboard(): Promise<TodayPlanShape | null> {
  // STORY-046 — proxy back through /api/today-plan (which forwards the cookie to Fastify) so
  // the dashboard's summary card has the same shape the /plan page sees. Fail-soft: when the
  // API is unreachable or returns 4xx/5xx, return null and the summary card renders an empty
  // state ("Today's plan is empty.") rather than blocking the dashboard.
  try {
    const incoming = await headers();
    const cookie = incoming.get("cookie") ?? "";
    const host = incoming.get("host") ?? "localhost:3000";
    const proto = incoming.get("x-forwarded-proto") ?? "http";
    const url = `${proto}://${host}/api/today-plan`;
    const res = await fetch(url, {
      headers: { ...(cookie ? { cookie } : {}) },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { today_plan: TodayPlanShape } | null;
    return json?.today_plan ?? null;
  } catch {
    return null;
  }
}

function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/auth/signin" });
      }}
      style={{ marginTop: "2rem" }}
    >
      <button
        type="submit"
        style={{
          padding: "0.5rem 0.9rem",
          background: "#444",
          color: "white",
          border: "none",
          borderRadius: 4,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </form>
  );
}
