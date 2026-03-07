-- Reconcile ticket_step_executions_tph schema for environments that created the table
-- before all discriminator columns were added.

DO $$
BEGIN
  ALTER TYPE "public"."step_execution_status" ADD VALUE IF NOT EXISTS 'not_started';
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ticket_step_executions_tph" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticket_id" text NOT NULL,
  "step_name" text NOT NULL,
  "type" text NOT NULL,
  "status" "step_execution_status" NOT NULL,
  "idempotency_key" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "steps_to_reproduce_score" integer,
  "expected_behavior_score" integer,
  "observed_behavior_score" integer,
  "reasoning" text,
  "raw_response" text,
  "outcome" "repro_attempt_outcome",
  "github_issue_number" integer,
  "github_issue_id" text,
  "github_agent_run_id" text,
  "agent_summary" text,
  "failing_test_path" text,
  "failing_test_commit_sha" text,
  "failure_reason" text,
  "raw_result_json" jsonb,
  "completed_at" timestamp with time zone,
  "last_polled_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "steps_to_reproduce_score" integer;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "expected_behavior_score" integer;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "observed_behavior_score" integer;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "reasoning" text;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "raw_response" text;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "outcome" "repro_attempt_outcome";
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "github_issue_number" integer;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "github_issue_id" text;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "github_agent_run_id" text;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "agent_summary" text;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "failing_test_path" text;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "failing_test_commit_sha" text;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "failure_reason" text;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "raw_result_json" jsonb;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
ALTER TABLE "ticket_step_executions_tph" ADD COLUMN IF NOT EXISTS "last_polled_at" timestamp with time zone;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_step_executions_tph_ticket_id_tickets_id_fk'
  ) THEN
    ALTER TABLE "ticket_step_executions_tph"
      ADD CONSTRAINT "ticket_step_executions_tph_ticket_id_tickets_id_fk"
      FOREIGN KEY ("ticket_id")
      REFERENCES "public"."tickets"("id")
      ON DELETE cascade
      ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_step_executions_tph_idempotency_key_unique"
ON "ticket_step_executions_tph" USING btree ("idempotency_key");
