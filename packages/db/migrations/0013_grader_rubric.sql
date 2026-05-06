-- STORY-034 — split critique/grader agent. Adds 4 nullable columns to `episodes` to persist the
-- new rubric shape produced by the dedicated grader agent (1-5 integer dimensions + free-text
-- reasoning). Nullable so historical rows pre-split stay valid; the grader writes them on every
-- post-tests pass after the split lands.

ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "rubric_idiomatic" integer;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "rubric_efficiency" integer;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "rubric_test_coverage" integer;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "rubric_reasoning" text;
