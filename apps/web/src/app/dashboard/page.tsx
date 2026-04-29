import { redirect } from "next/navigation";
import { auth, signOut } from "../../auth/auth.js";
import { destinationForUser } from "../../auth/post-signin.js";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  const dest = await destinationForUser(session.user.id);
  if (dest !== "/dashboard") {
    redirect(dest);
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Dashboard</h1>
      <p>Welcome back, {session.user.email}.</p>
      <p style={{ color: "#666" }}>
        The real dashboard lands with the MVP loop. For now this is a placeholder so STORY-005 can
        wire the auth + profile-bootstrap split.
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
