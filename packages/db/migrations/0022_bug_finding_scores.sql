-- STORY-037a — Debug-grader runtime wiring follow-up to STORY-037.
--
-- One row per (user, bug_archetype) pair tracks how reliably the user identifies+fixes a given
-- bug archetype. Mirrors `skill_scores` shape but keyed by archetype rather than concept_id —
-- "found bug correctly" is orthogonal to "wrote new code correctly" so it gets its own axis.
--
-- The EWMA semantics live in `packages/scoring/src/policies/bug-finding-policy.ts` (already on
-- main from STORY-037). This migration is the persistence shape:
--   - score        numeric(10, 6) in [0, 1] — bug-finding-policy clamps; a stray write outside
--                  the range is technically OK in the column but the helper enforces.
--   - confidence   numeric(10, 6) in [0, 1] — grows monotonically toward `confidence_max`.
--   - attempts     integer ≥ 0 — total submit closes that touched this archetype.
--   - bug_archetype text — one of the 8 archetypes from 0018_debug_problems.sql; CHECK constraint
--                  mirrors the discriminator there.
--
-- Idempotent CREATE TABLE / CREATE INDEX so a partially-applied dev DB picks up the rest of the
-- changes on a re-run.

CREATE TABLE IF NOT EXISTS "bug_finding_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"user_id" uuid NOT NULL,
	"bug_archetype" text NOT NULL,
	"score" numeric(10, 6) DEFAULT '0.5' NOT NULL,
	"confidence" numeric(10, 6) DEFAULT '0' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bug_finding_scores" ADD CONSTRAINT "bug_finding_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bug_finding_scores_archetype_check'
  ) THEN
    ALTER TABLE "bug_finding_scores"
      ADD CONSTRAINT "bug_finding_scores_archetype_check"
      CHECK (
        bug_archetype IN (
          'off_by_one',
          'mutation_in_iteration',
          'reference_equality',
          'async_race',
          'late_binding',
          'shadowing',
          'type_coercion',
          'default_arg_mutability'
        )
      );
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bug_finding_scores_user_archetype_uniq"
  ON "bug_finding_scores" ("user_id", "bug_archetype", "org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bug_finding_scores_user_idx"
  ON "bug_finding_scores" ("user_id");
