-- STORY-036 — Tutor mode toggle (Cloud / Local / Auto-fallback) for the Ollama local-LLM
-- adapter. Adds a single `tutor_mode` text column on `profiles` with a CHECK constraint
-- limiting values to the three documented modes. Default is `cloud` so existing users keep
-- the Anthropic-backed experience without any change in behaviour (AC #6 — no regressions).

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "tutor_mode" text DEFAULT 'cloud' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_tutor_mode_check" CHECK ("tutor_mode" IN ('cloud', 'local', 'auto-fallback'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
