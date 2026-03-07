ALTER TABLE "ticket_step_executions_tph"
  ADD COLUMN IF NOT EXISTS "fix_operation_outcome" text,
  ADD COLUMN IF NOT EXISTS "fixed_test_path" text,
  ADD COLUMN IF NOT EXISTS "summary_of_fix" text,
  ADD COLUMN IF NOT EXISTS "fix_confidence_level" real;

UPDATE "ticket_step_executions_tph"
SET
  "fix_operation_outcome" = CASE
    WHEN "outcome" = 'reproduced' THEN 'fixed'
    WHEN "outcome" = 'not_reproducible' THEN 'not_fixed'
    ELSE "outcome"::text
  END,
  "fixed_test_path" = "failing_test_path",
  "summary_of_fix" = "summary_of_findings",
  "fix_confidence_level" = "confidence_level"
WHERE
  "type" = 'github_fix_failing_test'
  AND (
    "fix_operation_outcome" IS NULL
    OR "fixed_test_path" IS NULL
    OR "summary_of_fix" IS NULL
    OR "fix_confidence_level" IS NULL
  );
