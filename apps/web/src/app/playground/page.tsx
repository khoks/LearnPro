import { PlaygroundClient } from "./PlaygroundClient";

export const dynamic = "force-dynamic";

export default function PlaygroundPage() {
  return (
    <main style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Playground</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#555" }}>
          Run Python or TypeScript inside the LearnPro sandbox. Heavier UX (problem framing, hints,
          submit-against-hidden-tests) lands later — this page is the bare runner.
        </p>
      </header>
      <PlaygroundClient />
    </main>
  );
}
