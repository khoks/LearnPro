-- STORY-039 — LLM-generated problem variants. Cache the LLM output keyed off the source
-- problem so we don't re-pay the generation cost on every assign-problem hit.
--
-- One row per generated variant. `source_problem_id` references the seed problem the
-- variant was derived from (FK + index for "list variants for problem X"). `variant_def` is
-- the entire jsonb-serialised ProblemDef the LLM produced — validated against the same Zod
-- schema seed-bank YAMLs go through, so a row in this table is interchangeable with a YAML.
--
-- Migration intentionally claims slot 0023 to avoid colliding with the in-flight STORY-037a
-- worktree which is claiming 0022 (debug-grader runtime wiring).

CREATE TABLE IF NOT EXISTS "problem_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"source_problem_id" uuid NOT NULL,
	"variant_def" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "problem_variants" ADD CONSTRAINT "problem_variants_source_problem_id_problems_id_fk" FOREIGN KEY ("source_problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "problem_variants_source_idx" ON "problem_variants" USING btree ("source_problem_id","created_at" DESC);
