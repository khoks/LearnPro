CREATE TYPE "public"."agent_role" AS ENUM('tutor', 'interviewer', 'reflection', 'grader', 'router');--> statement-breakpoint
CREATE TYPE "public"."episode_outcome" AS ENUM('passed', 'passed_with_hints', 'failed', 'abandoned', 'revealed');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'web_push', 'email', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."submission_language" AS ENUM('python', 'typescript');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid,
	"episode_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"role" "agent_role",
	"prompt_version" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"called_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"parent_concept_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"final_outcome" "episode_outcome",
	"time_to_solve_ms" bigint,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"track_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"language" "submission_language" NOT NULL,
	"difficulty" text NOT NULL,
	"statement" text NOT NULL,
	"starter_code" text,
	"hidden_tests" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"target_role" text,
	"time_budget_min" integer,
	"primary_goal" text,
	"self_assessed_level" text,
	"language_comfort" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_scores" (
	"user_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"last_practiced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_scores_user_id_concept_id_pk" PRIMARY KEY("user_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"episode_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"passed" boolean NOT NULL,
	"runtime_ms" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"language" "submission_language" NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"email" text NOT NULL,
	"github_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_calls" ADD CONSTRAINT "agent_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_calls" ADD CONSTRAINT "agent_calls_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episodes" ADD CONSTRAINT "episodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episodes" ADD CONSTRAINT "episodes_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problems" ADD CONSTRAINT "problems_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_scores" ADD CONSTRAINT "skill_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skill_scores" ADD CONSTRAINT "skill_scores_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_calls_user_called_idx" ON "agent_calls" USING btree ("user_id","called_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "concepts_slug_lang_uniq" ON "concepts" USING btree ("org_id","language","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "concepts_parent_idx" ON "concepts" USING btree ("parent_concept_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_user_started_idx" ON "episodes" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_problem_idx" ON "episodes" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_sent_idx" ON "notifications" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "problems_slug_uniq" ON "problems" USING btree ("org_id","track_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_scores_user_idx" ON "skill_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_episode_idx" ON "submissions" USING btree ("episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tracks_slug_uniq" ON "tracks" USING btree ("org_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uniq" ON "users" USING btree ("org_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_github_uniq" ON "users" USING btree ("github_id");