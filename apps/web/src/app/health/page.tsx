import { healthPayload } from "@learnpro/shared";

export const dynamic = "force-dynamic";

export default function HealthPage() {
  const payload = healthPayload({ service: "web" });
  return (
    <main id="main-content" style={{ padding: "1.25rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Health</h1>
      {/* STORY-025 — `pre` blocks default to no wrapping, which forces a horizontal scrollbar
          when a long string lands on a 320–768 viewport. `whiteSpace: pre-wrap` + word-break
          keeps the JSON readable without overflow. */}
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {JSON.stringify(payload, null, 2)}
      </pre>
    </main>
  );
}
