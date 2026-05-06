-- STORY-045 — Email digest notifications (daily + weekly).
--
-- Adds four `profiles` columns:
--   - email_daily_opt_in       — opt-in flag for the daily digest (off by default)
--   - email_weekly_opt_in      — opt-in flag for the weekly digest (off by default)
--   - email_weekly_day_of_week — 1=Monday … 7=Sunday for the weekly send (default Monday)
--   - email_unsubscribe_token  — random hex token populated on first opt-in; powers the
--                                one-click unsubscribe + RFC 8058 List-Unsubscribe header.

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "email_daily_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "email_weekly_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "email_weekly_day_of_week" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "email_unsubscribe_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_email_unsubscribe_token_uniq" ON "profiles" USING btree ("email_unsubscribe_token") WHERE "email_unsubscribe_token" IS NOT NULL;
