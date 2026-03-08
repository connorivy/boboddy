ALTER TABLE "ticket_step_executions" DROP CONSTRAINT "ticket_step_executions_pipeline_run_id_pipeline_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" DROP CONSTRAINT "ticket_step_executions_tph_pipeline_run_id_pipeline_runs_id_fk";
--> statement-breakpoint
DROP TABLE "pipeline_runs";--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"pipeline_name" text NOT NULL,
	"status" "pipeline_run_status" NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_step_executions" ALTER COLUMN "pipeline_run_id" SET DATA TYPE integer USING "pipeline_run_id"::integer;--> statement-breakpoint
ALTER TABLE "ticket_step_executions" ALTER COLUMN "pipeline_run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" ALTER COLUMN "pipeline_run_id" SET DATA TYPE integer USING "pipeline_run_id"::integer;--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" ALTER COLUMN "pipeline_run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_step_executions" ADD CONSTRAINT "ticket_step_executions_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" ADD CONSTRAINT "ticket_step_executions_tph_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;
