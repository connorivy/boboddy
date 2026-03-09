ALTER TABLE "ticket_description_quality_assessments" ALTER COLUMN "step_execution_id" SET DATA TYPE uuid USING "step_execution_id"::uuid;--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;
