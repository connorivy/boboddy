ALTER TABLE "ticket_step_executions_tph" ADD COLUMN "ticket_id" text;
--> statement-breakpoint
UPDATE "ticket_step_executions_tph" AS tse
SET "ticket_id" = COALESCE(pr."ticket_id", tse."pipeline_id"::text)
FROM "pipeline_runs" AS pr
WHERE pr."id" = tse."pipeline_id";
--> statement-breakpoint
UPDATE "ticket_step_executions_tph"
SET "ticket_id" = "pipeline_id"::text
WHERE "ticket_id" IS NULL AND "pipeline_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" ALTER COLUMN "ticket_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" ADD CONSTRAINT "ticket_step_executions_tph_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
