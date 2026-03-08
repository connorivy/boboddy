ALTER TABLE "ticket_step_executions" DROP CONSTRAINT IF EXISTS "ticket_step_executions_ticket_id_tickets_id_fk";--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" DROP CONSTRAINT IF EXISTS "ticket_step_executions_tph_ticket_id_tickets_id_fk";--> statement-breakpoint
ALTER TABLE "ticket_step_executions" RENAME COLUMN "ticket_id" TO "pipeline_id";--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" RENAME COLUMN "ticket_id" TO "pipeline_id";
