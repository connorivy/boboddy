CREATE TYPE "public"."pipeline_run_status" AS ENUM('queued', 'running', 'waiting', 'halted', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"status" "pipeline_run_status" DEFAULT 'queued' NOT NULL,
	"current_step_name" text,
	"current_step_execution_id" integer,
	"last_completed_step_name" text,
	"halt_reason" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_current_step_execution_id_ticket_step_executions_tph_id_fk" FOREIGN KEY ("current_step_execution_id") REFERENCES "public"."ticket_step_executions_tph"("id") ON DELETE set null ON UPDATE no action;