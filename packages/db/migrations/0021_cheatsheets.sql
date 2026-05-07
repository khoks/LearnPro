-- STORY-041 — personal cheatsheet auto-generation per session. One row per generated
-- cheatsheet. `episodes_covered` is a jsonb array of episode IDs the cheatsheet was
-- derived from; `entries` is the jsonb array of `{ concept, definition, code_example,
-- gotcha }` objects (max ~6); `markdown_content` is the rendered markdown the user can
-- edit in place before exporting to PDF.

CREATE TABLE IF NOT EXISTS "cheatsheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid NOT NULL,
	"episodes_covered" jsonb NOT NULL,
	"entries" jsonb NOT NULL,
	"markdown_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cheatsheets" ADD CONSTRAINT "cheatsheets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cheatsheets_user_created_idx" ON "cheatsheets" USING btree ("user_id","created_at" DESC);
