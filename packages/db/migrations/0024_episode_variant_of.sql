-- STORY-039c — Per-user "already seen the seed" tracking for problem variants.
--
-- When the assigner swaps a seed for one of its cached LLM-generated variants
-- (because the user has already closed the seed), we need to remember which
-- seed the variant came from on the episode row itself. The
-- `problem_variants.source_problem_id` already exists, but that's per-variant;
-- this column is per-episode so the variant→source link survives even if the
-- cache row is later evicted.
--
-- Nullable: existing episodes (and future episodes served the seed directly)
-- leave it NULL. FK to `problems.id` with ON DELETE SET NULL so a deleted seed
-- doesn't orphan or cascade-delete the episode (which may carry user data we
-- still want for skill scores / XP / retention).

ALTER TABLE "episodes"
  ADD COLUMN IF NOT EXISTS "is_variant_of_problem_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episodes" ADD CONSTRAINT "episodes_is_variant_of_problem_id_problems_id_fk" FOREIGN KEY ("is_variant_of_problem_id") REFERENCES "public"."problems"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_is_variant_of_idx" ON "episodes" USING btree ("is_variant_of_problem_id");
