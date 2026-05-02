import { redirect } from "next/navigation";
import { auth, signOut } from "../../auth/auth.js";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Onboarding (STORY-053)</h1>
      <p style={{ color: "#666" }}>
        The conversational onboarding agent lands with{" "}
        <a href="https://github.com/khoks/LearnPro/blob/main/project/stories/STORY-053-conversational-onboarding-agent.md">
          STORY-053
        </a>
        . For now, your profile shell exists but target_role isn&apos;t set yet.
      </p>
      <SignOutButton />
    </main>
  );
}

function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/auth/signin" });
      }}
      style={{ marginTop: "1.5rem" }}
    >
      <button
        type="submit"
        style={{
          padding: "0.5rem 0.9rem",
          background: "#444",
          color: "white",
          border: "none",
          borderRadius: 4,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </form>
  );
}
