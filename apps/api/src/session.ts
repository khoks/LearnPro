import { findSessionUser, type LearnProDb, type SessionUser } from "@learnpro/db";
import type { FastifyRequest } from "fastify";

// Cookie names Auth.js sets in apps/web. Production sites get the `__Secure-` prefix because
// the cookie is `Secure: true`; dev (HTTP) gets the unprefixed variant. We accept either.
const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

export interface SessionResolverOptions {
  db: LearnProDb;
}

export type SessionResolver = (req: FastifyRequest) => Promise<SessionUser | null>;

// Default cross-app session resolver — reads the Auth.js session cookie, looks the token up in
// the `sessions` table, returns the joined `users` row. Returns null when the cookie is missing,
// unknown, or expired.
export function buildSessionResolver(opts: SessionResolverOptions): SessionResolver {
  return async (req) => {
    const token = readSessionCookie(req);
    if (!token) return null;
    return findSessionUser({ db: opts.db, session_token: token });
  };
}

function readSessionCookie(req: FastifyRequest): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const cookies = parseCookies(header);
  for (const name of SESSION_COOKIE_NAMES) {
    const v = cookies.get(name);
    if (v) return v;
  }
  return null;
}

// Tiny cookie parser — avoids pulling in @fastify/cookie just for read-only access.
export function parseCookies(header: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out.set(k, decodeURIComponent(v));
  }
  return out;
}
