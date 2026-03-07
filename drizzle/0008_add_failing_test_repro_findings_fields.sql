ALTER TABLE "ticket_step_executions_tph"
  ADD COLUMN IF NOT EXISTS "summary_of_findings" text,
  ADD COLUMN IF NOT EXISTS "confidence_level" real;
