CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- STORY-063 (e2e): wrap with IF NOT EXISTS so a fresh `db:migrate` against an empty Postgres
-- doesn't trip on the column 0006 already added. The original commit-f7be38a description claimed
-- the 0008 SQL was idempotent — only the CREATE TABLE / DO $$ EXCEPTION block was, but the
-- ADD COLUMN wasn't. Adding IF NOT EXISTS keeps the no-op-against-existing-DB invariant the
-- repair migration was supposed to have, AND lets a fresh DB apply the chain end-to-end.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dedupe_key" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "web_push_subscriptions_endpoint_uniq" ON "web_push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "web_push_subscriptions_user_idx" ON "web_push_subscriptions" USING btree ("user_id");