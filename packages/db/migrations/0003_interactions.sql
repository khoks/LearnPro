CREATE TYPE "public"."interaction_type" AS ENUM('cursor_focus', 'voice', 'edit', 'revert', 'run', 'submit', 'hint_request', 'hint_received', 'autonomy_decision');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid,
	"episode_id" uuid,
	"type" "interaction_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"t" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "interactions_summary" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interactions" ADD CONSTRAINT "interactions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_episode_t_idx" ON "interactions" USING btree ("episode_id","t");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interactions_user_t_idx" ON "interactions" USING btree ("user_id","t");