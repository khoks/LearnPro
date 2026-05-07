-- STORY-033 — Async profile-update agent for higher-level trait synthesis.
--
-- One row per insight emitted by the async Haiku-backed synthesis agent. The agent runs as a
-- BullMQ job triggered at session-end, reads the user's last 30 days of episodes, and emits 1-3
-- short cross-episode insights ("user reaches for `for` when comprehensions would be cleaner";
-- "mutability boundaries trip them across multiple problem types"). The tutor reads the latest
-- 1-3 active insights at next-session start so it can reference them in the assign-problem
-- opener — same coach-voice rules apply (never accusatory).
--
-- `episodes_covered` is the jsonb array of episode UUIDs the synthesis was derived from
-- (provenance + retention sweepers can null it out without losing the insight text).
-- `concept_tags` is the kebab-case concept slugs the insight involves — gives the tutor + UI a
-- cheap filter without re-running a synthesis call.
-- `referenced_count` is bumped each time the tutor's assign-problem opener references the
-- insight (substring match against `insight_text`) — this is the AC #5 telemetry signal.
-- `expires_at` defaults to created_at + 30 days; the dashboard + tutor only show non-expired.
--
-- Migration intentionally jumps from 0015 → 0017 to claim the next-but-one slot: 0016 is
-- reserved for an in-flight parallel work-stream. The journal stays linear.

CREATE TABLE IF NOT EXISTS "profile_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid NOT NULL,
	"insight_text" text NOT NULL,
	"episodes_covered" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"concept_tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"referenced_count" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profile_insights" ADD CONSTRAINT "profile_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profile_insights_user_created_idx" ON "profile_insights" USING btree ("user_id","created_at");
