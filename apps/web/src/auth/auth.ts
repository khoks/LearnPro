import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { accounts, bootstrapProfile, sessions, users, verificationTokens } from "@learnpro/db";
import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Nodemailer from "next-auth/providers/nodemailer";
import { getAuthDb } from "./db.js";

// Apps/web is the only Auth.js host. apps/api validates sessions by reading the `sessions` table
// directly (see findSessionUser in @learnpro/db) — no shared JWT secret needed for the self-hosted
// single-domain split.
export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(getAuthDb().db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  pages: { signIn: "/auth/signin" },
  providers: buildProviders(),
  events: {
    // Idempotent profile-shell bootstrap on first sign-in. The conversational onboarding agent
    // (STORY-053) populates target_role / time_budget_min / etc. afterwards.
    async signIn({ user }) {
      if (!user?.id) return;
      await bootstrapProfile({ db: getAuthDb().db, user_id: user.id });
    },
  },
};

function buildProviders(): NextAuthConfig["providers"] {
  const providers: NextAuthConfig["providers"] = [];

  // Email magic link. When EMAIL_SERVER is unset we plug in a stream-transport stub that logs the
  // link to stdout — that keeps self-hosted dev frictionless while still exercising the full
  // Auth.js verification flow (token written to verificationTokens, callback URL hits
  // /api/auth/callback/nodemailer). `server: { jsonTransport: true }` satisfies the provider's
  // mandatory `server` config without opening an SMTP connection; the override below ignores
  // nodemailer entirely and just logs the URL.
  const emailServer = process.env["EMAIL_SERVER"];
  const emailFrom = process.env["EMAIL_FROM"] ?? "LearnPro <noreply@learnpro.local>";
  if (emailServer) {
    providers.push(Nodemailer({ server: emailServer, from: emailFrom }));
  } else {
    providers.push(
      Nodemailer({
        server: { jsonTransport: true },
        from: emailFrom,
        async sendVerificationRequest({ identifier, url }) {
          console.log(`[auth] magic link for ${identifier}: ${url}`);
        },
      }),
    );
  }

  const githubId = process.env["GITHUB_CLIENT_ID"];
  const githubSecret = process.env["GITHUB_CLIENT_SECRET"];
  if (githubId && githubSecret) {
    providers.push(GitHub({ clientId: githubId, clientSecret: githubSecret }));
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// Cookie name used by both apps for cross-app session lookup. Auth.js sets this in production
// as `__Secure-authjs.session-token`; in dev (HTTP) it's `authjs.session-token`. apps/api reads
// whichever one is present.
export const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

export function isGithubAuthEnabled(): boolean {
  return !!(process.env["GITHUB_CLIENT_ID"] && process.env["GITHUB_CLIENT_SECRET"]);
}
