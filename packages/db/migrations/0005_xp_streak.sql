CREATE TABLE IF NOT EXISTS "xp_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid NOT NULL,
	"episode_id" uuid,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "streak_grace_days_remaining" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "streak_grace_last_replenished_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "xp_awards" ADD CONSTRAINT "xp_awards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "xp_awards" ADD CONSTRAINT "xp_awards_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "xp_awards_user_awarded_idx" ON "xp_awards" USING btree ("user_id","awarded_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "xp_awards_user_episode_reason_uniq" ON "xp_awards" USING btree ("user_id","episode_id","reason");