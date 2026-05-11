-- STORY-039e — Persistent log of variant-generation attempts that failed any of the gates
-- (structural Zod parse, identity drift, self-validation against hidden_tests, LLM-judge
-- spec-clarity rubric, or retry exhaustion). The companion `problem_variants` table only
-- stores SUCCESSFUL variants — without this table, an operator has no surface to see WHICH
-- variants failed, WHY, or how often.
--
-- One row per failed attempt (NOT per source — a single source problem can produce many
-- failed attempts across retries). `failure_reason` is a CHECK-constrained discriminator;
-- `failure_detail` is the per-reason payload (e.g. `{ "zod_error": "..." }` for parse_error,
-- `{ "field": "language", "expected": "python", "got": "javascript" }` for identity_mismatch).
--
-- The route inserts fire-and-forget — telemetry sink failures are logged but never block the
-- variant-generation response.
--
-- Strictly read-only from the admin surface — there's no retry / publish / delete action in v1.

CREATE TABLE IF NOT EXISTS "variant_gate_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text DEFAULT 'self' NOT NULL,
	"source_problem_id" uuid NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_reason" text NOT NULL,
	"failure_detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_id" text NOT NULL,
	"attempt_number" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variant_gate_failures" ADD CONSTRAINT "variant_gate_failures_source_problem_id_problems_id_fk" FOREIGN KEY ("source_problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'variant_gate_failures_reason_check'
  ) THEN
    ALTER TABLE "variant_gate_failures"
      ADD CONSTRAINT "variant_gate_failures_reason_check"
      CHECK (
        failure_reason IN (
          'parse_error',
          'identity_mismatch',
          'spec_clarity_judge',
          'self_validation',
          'retry_exhausted'
        )
      );
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'variant_gate_failures_attempt_check'
  ) THEN
    ALTER TABLE "variant_gate_failures"
      ADD CONSTRAINT "variant_gate_failures_attempt_check"
      CHECK (attempt_number >= 1);
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variant_gate_failures_source_idx" ON "variant_gate_failures" USING btree ("source_problem_id","attempted_at" DESC);
