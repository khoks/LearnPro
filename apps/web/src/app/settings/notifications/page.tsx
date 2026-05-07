import { redirect } from "next/navigation";
import { auth } from "../../../auth/auth.js";
import { EmailDigestCard } from "../../../components/settings/EmailDigestCard.js";
import { QuietHoursCard } from "../../../components/settings/QuietHoursCard.js";

// STORY-045 — Notifications settings page. Bundles the email digest opt-ins (this Story) with
// the existing quiet-hours card (STORY-024) so users have one place for notification controls.

export const dynamic = "force-dynamic";

export default async function SettingsNotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  return (
    <main
      id="main-content"
      style={{
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0 }}>Notifications</h1>
        <p style={{ margin: "0.5rem 0 0", color: "#555" }}>
          Pick how you&apos;d like to be reminded. Every channel is opt-in and individually
          adjustable.
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <QuietHoursCard />
        <EmailDigestCard />
      </div>
    </main>
  );
}
