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
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
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
