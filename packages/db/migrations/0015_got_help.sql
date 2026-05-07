-- STORY-042 — Anti-cheat v1: per-episode "got help" honesty flag.
--
-- Adds a single boolean to `episodes`. Default false; flipped to true when the user opts in via the
-- "I got help on this one" toggle in the result panel (or — implicitly — by accepting the
-- paste-detect modal's "I got help" path). Skill-update logic skips the concept-mastery bump for
-- got_help=true episodes, but the submission is still graded normally (tests still run, XP still
-- awards). Anti-dark-pattern: never penalize, just don't reward concept mastery.
--
-- Note: 0013 / 0014 are claimed by parallel work (grader rubric split + reserved). This migration
-- intentionally lands at 0015 so the journal stays linear.

ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "got_help" boolean DEFAULT false NOT NULL;
