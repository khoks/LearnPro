-- STORY-032 — knowledge graph population. Extends `concepts` with the four
-- learner-facing columns the seeder backfills from YAML, and creates the
-- `prerequisites` edge table the planner walks. All four `concepts` columns
-- are nullable so prior STORY-019/020 inserts (which only set name/language/slug)
-- remain valid; the seeder is the only writer that populates them.

ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "default_difficulty" integer;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "tags" jsonb;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN IF NOT EXISTS "track_slugs" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prerequisites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"from_concept_id" uuid NOT NULL,
	"to_concept_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_from_concept_id_concepts_id_fk" FOREIGN KEY ("from_concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_to_concept_id_concepts_id_fk" FOREIGN KEY ("to_concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prerequisites_edge_uniq" ON "prerequisites" USING btree ("org_id","from_concept_id","to_concept_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prerequisites_from_idx" ON "prerequisites" USING btree ("from_concept_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prerequisites_to_idx" ON "prerequisites" USING btree ("to_concept_id");
