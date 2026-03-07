ALTER TABLE "failing_test_repro_attempts"
  ADD COLUMN IF NOT EXISTS "github_pr_target_branch" text;
--> statement-breakpoint

ALTER TABLE "ticket_step_executions_tph"
  ADD COLUMN IF NOT EXISTS "github_pr_target_branch" text;
