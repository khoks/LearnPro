import {
  getActiveTrackSlugs,
  getDueConcepts,
  getStreakSnapshot,
  getTrackProgress,
  getUserXp,
  type TrackProgress,
} from "@learnpro/db";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../auth/auth.js";
import { getAuthDb } from "../../auth/db.js";
import { destinationForUser } from "../../auth/post-signin.js";
import { AutonomyBandIndicator } from "../../components/autonomy/AutonomyBandIndicator.js";
import { QuietHoursCard } from "../../components/settings/QuietHoursCard.js";
import { DueReviewsCard, TrackProgressBar } from "./dashboard-components.js";
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
  const [xp, streak, activeTrackSlugs, dueReviews] = await Promise.all([
    getUserXp(db, userId),
    getStreakSnapshot(db, userId, today, MONTHLY_GRACE_CAP),
    getActiveTrackSlugs(db, userId),
    getDueConcepts(db, userId, today),
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

      <DashboardCardsRow
        xp={xp}
        streakDays={streak.streakDays}
        graceDaysRemaining={streak.graceDaysRemaining}
        graceDaysUsedThisCheck={streak.graceDaysUsed}
        monthlyGraceCap={MONTHLY_GRACE_CAP}
      />

      {dueReviews.length > 0 ? (
        <section aria-label="Spaced repetition" style={{ marginTop: "1.25rem" }}>
          <DueReviewsCard count={dueReviews.length} activeTrackSlug={primaryTrackSlug ?? null} />
        </section>
      ) : null}

      <section aria-label="Tutor autonomy" style={{ marginTop: "1.25rem" }}>
        <AutonomyBandIndicator />
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
