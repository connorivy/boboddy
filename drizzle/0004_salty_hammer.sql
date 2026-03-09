ALTER TABLE "ticket_step_executions_tph" ALTER COLUMN "steps_to_reproduce_score" SET DATA TYPE real USING "steps_to_reproduce_score"::real;--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" ALTER COLUMN "expected_behavior_score" SET DATA TYPE real USING "expected_behavior_score"::real;--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" ALTER COLUMN "observed_behavior_score" SET DATA TYPE real USING "observed_behavior_score"::real;--> statement-breakpoint

UPDATE "ticket_step_executions_tph"
SET
  "steps_to_reproduce_score" = CASE
    WHEN "steps_to_reproduce_score" > 1 THEN "steps_to_reproduce_score" / 5.0
    ELSE "steps_to_reproduce_score"
  END,
  "expected_behavior_score" = CASE
    WHEN "expected_behavior_score" > 1 THEN "expected_behavior_score" / 5.0
    ELSE "expected_behavior_score"
  END,
  "observed_behavior_score" = CASE
    WHEN "observed_behavior_score" > 1 THEN "observed_behavior_score" / 5.0
    ELSE "observed_behavior_score"
  END
WHERE
  "steps_to_reproduce_score" IS NOT NULL
  OR "expected_behavior_score" IS NOT NULL
  OR "observed_behavior_score" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "ticket_step_executions_tph" DROP CONSTRAINT IF EXISTS "ticket_step_executions_tph_steps_to_reproduce_score_range";--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" DROP CONSTRAINT IF EXISTS "ticket_step_executions_tph_expected_behavior_score_range";--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" DROP CONSTRAINT IF EXISTS "ticket_step_executions_tph_observed_behavior_score_range";--> statement-breakpoint

ALTER TABLE "ticket_step_executions_tph" ADD CONSTRAINT "ticket_step_executions_tph_steps_to_reproduce_score_range" CHECK ("steps_to_reproduce_score" IS NULL OR ("steps_to_reproduce_score" >= 0 AND "steps_to_reproduce_score" <= 1));--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" ADD CONSTRAINT "ticket_step_executions_tph_expected_behavior_score_range" CHECK ("expected_behavior_score" IS NULL OR ("expected_behavior_score" >= 0 AND "expected_behavior_score" <= 1));--> statement-breakpoint
ALTER TABLE "ticket_step_executions_tph" ADD CONSTRAINT "ticket_step_executions_tph_observed_behavior_score_range" CHECK ("observed_behavior_score" IS NULL OR ("observed_behavior_score" >= 0 AND "observed_behavior_score" <= 1));
