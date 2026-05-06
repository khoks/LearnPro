import { accounts, type LearnProDb } from "@learnpro/db";
import { and, eq } from "drizzle-orm";
import { PORTFOLIO_PROVIDER_ID } from "./oauth.js";

// STORY-040 — Drizzle helpers for the elevated-scope GitHub token. We persist the token in
// the same `accounts` table NextAuth uses for the auth-only `github` provider, but under a
// separate provider id ("github-portfolio") so the auth-only row is never touched.
//
// The composite PK is (provider, providerAccountId), so a re-OAuth from the same user
// UPSERTs the row rather than appending a duplicate.

export async function upsertPortfolioAccount(opts: {
  db: LearnProDb;
  user_id: string;
  providerAccountId: string;
  access_token: string;
  scope: string;
  token_type: string;
}): Promise<void> {
  await opts.db
    .insert(accounts)
    .values({
      userId: opts.user_id,
      type: "oauth",
      provider: PORTFOLIO_PROVIDER_ID,
      providerAccountId: opts.providerAccountId,
      access_token: opts.access_token,
      scope: opts.scope,
      token_type: opts.token_type,
    })
    .onConflictDoUpdate({
      target: [accounts.provider, accounts.providerAccountId],
      set: {
        userId: opts.user_id,
        access_token: opts.access_token,
        scope: opts.scope,
        token_type: opts.token_type,
      },
    });
}

export async function deletePortfolioAccount(opts: {
  db: LearnProDb;
  user_id: string;
}): Promise<{ deleted: number }> {
  const rows = await opts.db
    .delete(accounts)
    .where(and(eq(accounts.userId, opts.user_id), eq(accounts.provider, PORTFOLIO_PROVIDER_ID)))
    .returning({ id: accounts.providerAccountId });
  return { deleted: rows.length };
}

export async function getPortfolioAccount(opts: { db: LearnProDb; user_id: string }): Promise<{
  providerAccountId: string;
  access_token: string | null;
  scope: string | null;
} | null> {
  const rows = await opts.db
    .select({
      providerAccountId: accounts.providerAccountId,
      access_token: accounts.access_token,
      scope: accounts.scope,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, opts.user_id), eq(accounts.provider, PORTFOLIO_PROVIDER_ID)))
    .limit(1);
  return rows[0] ?? null;
}
