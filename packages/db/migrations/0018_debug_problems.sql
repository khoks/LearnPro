-- STORY-037 — Debugging exercises engine.
--
-- Extends `problems` to discriminate "implement" (existing curated bank) from "debug" (broken-code,
-- find-and-fix). The text-based discriminator + nullable `bug_archetype` keeps the table thin —
-- no second `debug_problems` table — and matches the on-disk Zod discriminated union in
-- `@learnpro/problems`. STORY-038 will land "comprehension" using the same column.
--
-- New columns:
--   problems.kind            text not null default 'implement' — "implement" | "debug" | (future).
--   problems.bug_archetype   text                              — null when kind != "debug".
--
-- Idempotent (`IF NOT EXISTS`) so a partially-applied dev DB picks up the rest of the changes
-- on a re-run. The column defaults are explicit so existing rows backfill to "implement" with no
-- bug_archetype, preserving the seed bank's behavior verbatim.

ALTER TABLE "problems"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'implement';

ALTER TABLE "problems"
  ADD COLUMN IF NOT EXISTS "bug_archetype" text;

-- Lightweight CHECK so the column stays grounded — Postgres-level guard against a typo writing
-- a stray archetype string from a future migration. Mirrors the Zod enum in
-- packages/problems/src/schema.ts. Keeping it as a CHECK (not a pgEnum) so future stories can
-- extend by editing the enum literals in one place — pgEnums need an ALTER TYPE dance.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'problems_bug_archetype_check'
  ) THEN
    ALTER TABLE "problems"
      ADD CONSTRAINT "problems_bug_archetype_check"
      CHECK (
        bug_archetype IS NULL
        OR bug_archetype IN (
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'problems_kind_check'
  ) THEN
    ALTER TABLE "problems"
      ADD CONSTRAINT "problems_kind_check"
      CHECK (kind IN ('implement', 'debug'));
  END IF;
END
$$;

-- Index for the assigner: when v1 wires "give me debug-only problems for this track," the lookup
-- filters by kind. Cheap to add now.
CREATE INDEX IF NOT EXISTS "problems_track_kind_idx" ON "problems" (track_id, kind);
