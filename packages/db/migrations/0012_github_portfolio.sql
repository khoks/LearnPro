-- STORY-040 — GitHub portfolio integration. Adds:
--   - profiles.github_portfolio_repo (sticky preference, nullable until first connect)
--   - profiles.github_auto_push_enabled (per-user toggle, OFF by default — AC #5)
--   - portfolio_pushes table (one row per (user, episode); UNIQUE keyed for idempotent re-push)

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "github_portfolio_repo" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "github_auto_push_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "portfolio_pushes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"repo_owner" text NOT NULL,
	"repo_name" text DEFAULT 'learnpro-portfolio' NOT NULL,
	"directory_path" text NOT NULL,
	"commit_sha" text NOT NULL,
	"pushed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"auto" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_pushes" ADD CONSTRAINT "portfolio_pushes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_pushes" ADD CONSTRAINT "portfolio_pushes_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_pushes_user_episode_uniq" ON "portfolio_pushes" USING btree ("user_id","episode_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_pushes_user_pushed_idx" ON "portfolio_pushes" USING btree ("user_id","pushed_at");
