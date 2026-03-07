DO $$
BEGIN
  CREATE TYPE "public"."github_merge_status" AS ENUM ('draft', 'open', 'closed', 'merged');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "failing_test_repro_attempts"
  ADD COLUMN IF NOT EXISTS "github_merge_status" "github_merge_status";
--> statement-breakpoint

ALTER TABLE "ticket_step_executions_tph"
  ADD COLUMN IF NOT EXISTS "github_merge_status" "github_merge_status";
