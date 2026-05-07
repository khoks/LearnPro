import { redirect } from "next/navigation";
import { auth } from "../../../auth/auth.js";
import { TutorModeCard } from "../../../components/settings/TutorModeCard.js";

// STORY-036 — Settings page for the per-user `tutor_mode` toggle. Self-hosters who care
// about privacy / air-gap can flip this to local; everyone else gets the cloud default.
// The card hits /api/settings/llm-mode (proxied to the Fastify API) on mount to fetch the
// current value, so the rendered initial state is just a sensible default.

export const dynamic = "force-dynamic";

export default async function SettingsLlmModePage() {
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
        <h1 style={{ margin: 0 }}>Tutor mode</h1>
        <p style={{ margin: "0.5rem 0 0", color: "#555" }}>
          Choose where the tutor&apos;s language model runs. Your choice is per-account and can be
          changed at any time.
        </p>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <TutorModeCard />
      </div>
    </main>
  );
}
