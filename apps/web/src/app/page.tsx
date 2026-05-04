import { auth } from "../auth/auth.js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  return (
    <main id="main-content" style={{ padding: "1.25rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>LearnPro</h1>
      <p>Adaptive AI-tutored self-hosted learning platform.</p>
      <ul>
        {session?.user ? (
          <li>
            <a href="/dashboard">/dashboard</a> — your learning loop
          </li>
        ) : (
          <li>
            <a href="/auth/signin">/auth/signin</a> — sign in to start
          </li>
        )}
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
