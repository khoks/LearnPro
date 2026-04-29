import { and, eq, gt } from "drizzle-orm";
import type { LearnProDb } from "./client.js";
import { sessions, users } from "./schema.js";

export interface SessionUser {
  user_id: string;
  org_id: string;
  email: string;
}

export interface FindSessionUserOptions {
  db: LearnProDb;
  session_token: string;
  now?: Date;
}

// Reads the Auth.js `sessions` table directly so apps/api can authenticate Fastify requests using
// the session cookie that apps/web sets — no shared JWT secret needed in the self-hosted single-domain
// dev split. Returns null when the cookie is missing, unknown, or expired.
export async function findSessionUser(opts: FindSessionUserOptions): Promise<SessionUser | null> {
  const now = opts.now ?? new Date();
  const rows = await opts.db
    .select({
      user_id: users.id,
      org_id: users.org_id,
      email: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.sessionToken, opts.session_token), gt(sessions.expires, now)))
    .limit(1);
  return rows[0] ?? null;
}
