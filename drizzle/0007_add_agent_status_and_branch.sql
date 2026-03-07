DO $$
BEGIN
  CREATE TYPE "public"."agent_status" AS ENUM ('complete', 'error', 'abort', 'timeout', 'user_exit');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "failing_test_repro_attempts"
  ADD COLUMN IF NOT EXISTS "agent_status" "agent_status",
  ADD COLUMN IF NOT EXISTS "agent_branch" text;
--> statement-breakpoint

ALTER TABLE "ticket_step_executions_tph"
  ADD COLUMN IF NOT EXISTS "agent_status" "agent_status",
  ADD COLUMN IF NOT EXISTS "agent_branch" text;
