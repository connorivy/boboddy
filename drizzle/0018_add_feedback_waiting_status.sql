ALTER TYPE "step_execution_status" ADD VALUE IF NOT EXISTS 'waiting_for_user_feedback';

--> statement-breakpoint

ALTER TYPE "repro_attempt_outcome" ADD VALUE IF NOT EXISTS 'needs_user_feedback';
