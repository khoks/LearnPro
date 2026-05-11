-- STORY-039e — Add `is_admin` boolean to `users` so the admin-only Fastify routes can gate
-- access. Operator manually promotes a user via psql:
--
--   UPDATE users SET is_admin = true WHERE email = 'operator@example.com';
--
-- There is no UI for admin promotion in v1 (matches the "no SaaS plumbing in MVP" rule — admin
-- access is operator-only and out-of-band). Defaults to false so existing users stay
-- non-admin.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false NOT NULL;
