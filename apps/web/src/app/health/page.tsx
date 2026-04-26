import { healthPayload } from "@learnpro/shared";

export const dynamic = "force-dynamic";

export default function HealthPage() {
  const payload = healthPayload({ service: "web" });
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Health</h1>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
    </main>
  );
}
