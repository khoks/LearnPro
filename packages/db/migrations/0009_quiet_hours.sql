CREATE TABLE IF NOT EXISTS "deferred_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"deliver_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "quiet_hours_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "quiet_hours_start_min" integer DEFAULT 1320 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "quiet_hours_end_min" integer DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deferred_notifications" ADD CONSTRAINT "deferred_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deferred_notifications_deliver_after_idx" ON "deferred_notifications" USING btree ("deliver_after");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deferred_notifications_user_idx" ON "deferred_notifications" USING btree ("user_id");