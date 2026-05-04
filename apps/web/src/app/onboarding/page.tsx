import { redirect } from "next/navigation";
import { auth } from "../../auth/auth.js";
import { OnboardingClient } from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  return (
    <main
      id="main-content"
      style={{
        // STORY-025: clamp padding + cap with `maxWidth` so the page fits 320px+ viewports
        // without a horizontal scrollbar. The previous fixed `2rem` padding plus 720px max-
        // width left a ~32px overflow on a 768px viewport because nothing constrained the
        // content box itself.
        padding: "1.25rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Welcome to LearnPro</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#555" }}>
          A few quick questions to set up your learning plan. Skip any time.
        </p>
      </header>
      <OnboardingClient />
    </main>
  );
}
