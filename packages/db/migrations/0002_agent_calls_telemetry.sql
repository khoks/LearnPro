CREATE TYPE "public"."agent_task" AS ENUM('complete', 'stream', 'embed', 'tool_call');--> statement-breakpoint
ALTER TABLE "agent_calls" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "agent_calls" ADD COLUMN "task" "agent_task" DEFAULT 'complete' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_calls" ADD COLUMN "cached_tokens" integer;--> statement-breakpoint
ALTER TABLE "agent_calls" ADD COLUMN "cost_usd" numeric(18, 8) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_calls" ADD COLUMN "pricing_version" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_calls" ADD COLUMN "tool_used" text;