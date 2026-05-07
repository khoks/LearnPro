-- STORY-038 — "Read this code" comprehension exercises.
--
-- Extends `problems` to discriminate "comprehension" alongside the existing "implement" / "debug"
-- kinds. Comprehension problems show READ-ONLY code in the editor and a question + answer widget
-- below it (multiple-choice radio buttons or a free-text textarea). The text-based discriminator
-- + nullable `comprehension_format` / `answer_format` keep the table thin — no second table —
-- and matches the on-disk Zod discriminated union in `@learnpro/problems`.
--
-- Mutations:
--   problems.kind                     CHECK widened from {implement,debug} to add 'comprehension'.
--   problems.comprehension_format     text (nullable) — predict_output | trace_execution | reason_property.
--   problems.answer_format            text (nullable) — multiple_choice | free_text.
--
-- The two text columns use CHECK constraints rather than pgEnums so future stories can extend the
-- enums in one place — pgEnums need an ALTER TYPE dance. All three CHECKs allow NULL so existing
-- implement / debug rows backfill cleanly with NULL on both new columns.
--
-- Idempotent (`IF NOT EXISTS` + `DO $$ ... $$` guards) so a partially-applied dev DB picks up the
-- rest of the changes on a re-run.

ALTER TABLE "problems"
  ADD COLUMN IF NOT EXISTS "comprehension_format" text;

ALTER TABLE "problems"
  ADD COLUMN IF NOT EXISTS "answer_format" text;

-- Widen the kind CHECK. Drop+recreate is the simplest path that keeps the constraint name stable
-- (so 0018's existing constraint can be replaced cleanly without a separate "drop" migration).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'problems_kind_check') THEN
    ALTER TABLE "problems" DROP CONSTRAINT "problems_kind_check";
  END IF;
END
$$;

ALTER TABLE "problems"
  ADD CONSTRAINT "problems_kind_check"
  CHECK (kind IN ('implement', 'debug', 'comprehension'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'problems_comprehension_format_check'
  ) THEN
    ALTER TABLE "problems"
      ADD CONSTRAINT "problems_comprehension_format_check"
      CHECK (
        comprehension_format IS NULL
        OR comprehension_format IN ('predict_output', 'trace_execution', 'reason_property')
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'problems_answer_format_check'
  ) THEN
    ALTER TABLE "problems"
      ADD CONSTRAINT "problems_answer_format_check"
      CHECK (
        answer_format IS NULL
        OR answer_format IN ('multiple_choice', 'free_text')
      );
  END IF;
END
$$;
