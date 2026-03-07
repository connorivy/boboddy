ALTER TABLE "failing_test_repro_attempts"
  ALTER COLUMN "github_merge_status" SET DEFAULT 'draft';
--> statement-breakpoint

UPDATE "failing_test_repro_attempts"
SET "github_merge_status" = 'draft'
WHERE "github_merge_status" IS NULL;
--> statement-breakpoint

ALTER TABLE "failing_test_repro_attempts"
  ALTER COLUMN "github_merge_status" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "ticket_step_executions_tph"
  ALTER COLUMN "github_merge_status" SET DEFAULT 'draft';
--> statement-breakpoint

UPDATE "ticket_step_executions_tph"
SET "github_merge_status" = 'draft'
WHERE "github_merge_status" IS NULL;
--> statement-breakpoint

ALTER TABLE "ticket_step_executions_tph"
  ALTER COLUMN "github_merge_status" SET NOT NULL;
