import { redirect } from "next/navigation";
import { auth, isGithubAuthEnabled, signIn } from "../../../auth/auth.js";
import { destinationForUser } from "../../../auth/post-signin.js";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) {
    redirect(await destinationForUser(session.user.id));
  }

  const params = await searchParams;
  const sent = params.sent === "1";
  const callbackUrl = params.callbackUrl ?? "/dashboard";
  const githubEnabled = isGithubAuthEnabled();

  return (
    <main
      style={{
        padding: "3rem 2rem",
        maxWidth: 420,
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: "0.25rem" }}>Sign in to LearnPro</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Pick the way you prefer.</p>

      {sent ? <CheckEmailNotice /> : null}

      <form
        action={async (formData: FormData) => {
          "use server";
          const email = String(formData.get("email") ?? "").trim();
          if (!email) return;
          await signIn("nodemailer", { email, redirectTo: "/auth/signin?sent=1" });
        }}
        style={{ display: "grid", gap: "0.5rem", marginTop: "1.25rem" }}
      >
        <label htmlFor="email" style={{ fontWeight: 600 }}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          autoComplete="email"
          style={{
            padding: "0.55rem 0.7rem",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 4,
          }}
        />
        <button
          type="submit"
          style={{
            padding: "0.55rem 0.9rem",
            background: "#0a7",
            color: "white",
            border: "none",
            borderRadius: 4,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Email me a magic link
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "1.5rem 0" }}>
        <hr style={{ flex: 1, border: "none", borderTop: "1px solid #eee" }} />
        <span style={{ color: "#888", fontSize: 13 }}>or</span>
        <hr style={{ flex: 1, border: "none", borderTop: "1px solid #eee" }} />
      </div>

      <form
        action={async () => {
          "use server";
          await signIn("github", { redirectTo: callbackUrl });
        }}
      >
        <button
          type="submit"
          disabled={!githubEnabled}
          aria-disabled={!githubEnabled}
          title={
            githubEnabled
              ? "Sign in with GitHub"
              : "GitHub OAuth is not configured — set GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET"
          }
          style={{
            width: "100%",
            padding: "0.55rem 0.9rem",
            background: githubEnabled ? "#222" : "#aaa",
            color: "white",
            border: "none",
            borderRadius: 4,
            fontWeight: 600,
            cursor: githubEnabled ? "pointer" : "not-allowed",
          }}
        >
          Continue with GitHub
        </button>
      </form>
    </main>
  );
}

function CheckEmailNotice() {
  return (
    <section
      role="status"
      aria-live="polite"
      style={{
        padding: "0.75rem 1rem",
        marginTop: "1rem",
        background: "#eef9f1",
        border: "1px solid #b3dfc1",
        borderRadius: 4,
        color: "#1d5e34",
      }}
    >
      <strong>Check your email.</strong> We sent you a magic link. Click it to finish signing in.
    </section>
  );
}
