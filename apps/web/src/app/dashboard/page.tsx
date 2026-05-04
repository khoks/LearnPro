import {
  getActiveTrackSlugs,
  getStreakSnapshot,
  getTrackProgress,
  getUserXp,
  type TrackProgress,
} from "@learnpro/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "../../auth/auth.js";
import { getAuthDb } from "../../auth/db.js";
import { destinationForUser } from "../../auth/post-signin.js";
import { StreakCard, TrackProgressBar, XpCard } from "./dashboard-components.js";

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
  const [xp, streak, activeTrackSlugs] = await Promise.all([
    getUserXp(db, userId),
    getStreakSnapshot(db, userId, today, MONTHLY_GRACE_CAP),
    getActiveTrackSlugs(db, userId),
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
      style={{
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <p style={{ margin: "0.25rem 0 0", color: "#666" }}>
            Welcome back, {session.user.email}.
          </p>
        </div>
        <Link
          href={sessionHref}
          style={{
            display: "inline-block",
            padding: "0.6rem 1.1rem",
            background: "#3a82f7",
            color: "white",
            borderRadius: 6,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Start a session
        </Link>
      </header>

      <section
        aria-label="Your progress"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
      >
        <XpCard xp={xp} />
        <StreakCard
          streakDays={streak.streakDays}
          graceDaysRemaining={streak.graceDaysRemaining}
          graceDaysUsedThisCheck={streak.graceDaysUsed}
          monthlyGraceCap={MONTHLY_GRACE_CAP}
        />
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
