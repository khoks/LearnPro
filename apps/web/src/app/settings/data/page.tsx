import { redirect } from "next/navigation";
import { auth } from "../../../auth/auth.js";
import { getUserDataSummary } from "@learnpro/db";
import { getAuthDb } from "../../../auth/db.js";
import { DataActions } from "./data-actions.js";
import {
  ACCOUNT_SECTION_BODY,
  ACCOUNT_SECTION_TITLE,
  PAGE_INTRO,
  PAGE_TITLE,
  SUMMARY_HEADING,
  VOICE_SECTION_BODY,
  VOICE_SECTION_TITLE,
} from "./copy.js";

export const dynamic = "force-dynamic";

export default async function SettingsDataPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const db = getAuthDb();
  const summary = await getUserDataSummary(db, session.user.id);

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
        <h1 style={{ margin: 0 }}>{PAGE_TITLE}</h1>
        <p style={{ margin: "0.5rem 0 0", color: "#555" }}>{PAGE_INTRO}</p>
      </header>

      <section aria-labelledby="data-summary" style={{ marginBottom: "2rem" }}>
        <h2 id="data-summary" style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
          {SUMMARY_HEADING}
        </h2>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 1.5rem" }}>
          <SummaryRow label="Episodes" value={summary.episodes_count} />
          <SummaryRow label="Submissions" value={summary.submissions_count} />
          <SummaryRow label="Interactions" value={summary.interactions_count} />
          <SummaryRow label="Voice transcripts" value={summary.voice_transcripts_count} />
          <SummaryRow label="LLM calls" value={summary.agent_calls_count} />
          <SummaryRow
            label="Last active"
            value={summary.last_active_at ? new Date(summary.last_active_at).toLocaleString() : "—"}
          />
        </dl>
      </section>

      <section
        aria-labelledby="voice-section"
        style={{ marginBottom: "2rem", padding: "1rem", border: "1px solid #ddd", borderRadius: 8 }}
      >
        <h2 id="voice-section" style={{ fontSize: "1.05rem", marginTop: 0 }}>
          {VOICE_SECTION_TITLE}
        </h2>
        <p style={{ color: "#555" }}>{VOICE_SECTION_BODY}</p>
      </section>

      <section
        aria-labelledby="account-section"
        style={{ marginBottom: "2rem", padding: "1rem", border: "1px solid #ddd", borderRadius: 8 }}
      >
        <h2 id="account-section" style={{ fontSize: "1.05rem", marginTop: 0 }}>
          {ACCOUNT_SECTION_TITLE}
        </h2>
        <p style={{ color: "#555" }}>{ACCOUNT_SECTION_BODY}</p>
      </section>

      <DataActions
        voiceCount={summary.voice_transcripts_count}
        canDeleteVoice={summary.voice_transcripts_count > 0}
      />
    </main>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}): import("react").ReactElement {
  return (
    <div style={{ display: "contents" }}>
      <dt style={{ color: "#666", fontSize: "0.95rem" }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: "0.95rem" }}>{value}</dd>
    </div>
  );
}
