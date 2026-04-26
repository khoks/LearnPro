export default function HomePage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>LearnPro</h1>
      <p>Adaptive AI-tutored self-hosted learning platform.</p>
      <ul>
        <li>
          <a href="/playground">/playground</a> — run Python or TypeScript in the sandbox
        </li>
        <li>
          <a href="/health">/health</a> — service smoke check
        </li>
      </ul>
    </main>
  );
}
