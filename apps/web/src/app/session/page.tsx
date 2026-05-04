import { redirect } from "next/navigation";
import { auth } from "../../auth/auth.js";
import { SessionClient } from "./SessionClient";

export const dynamic = "force-dynamic";

interface SessionPageProps {
  searchParams: Promise<{ track?: string }>;
}

export default async function SessionPage({ searchParams }: SessionPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  const sp = await searchParams;
  const trackId = sp.track;
  if (!trackId || !isUuid(trackId)) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
        <h1 style={{ margin: 0 }}>Pick a track</h1>
        <p style={{ color: "#555" }}>
          Open a session with <code>?track=&lt;track-id&gt;</code>. The dashboard track-picker UI
          lands with STORY-022.
        </p>
      </main>
    );
  }
  return (
    <main style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif", maxWidth: 1080 }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Session</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#555", fontSize: 14 }}>
          Live tutor session — code, run, submit, ask for hints.
        </p>
      </header>
      <SessionClient trackId={trackId} />
    </main>
  );
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
