CREATE TYPE "public"."duplicate_candidate_status" AS ENUM('proposed', 'dismissed', 'promoted');--> statement-breakpoint
CREATE TYPE "public"."environment_area" AS ENUM('adm', 'mem', 'ps');--> statement-breakpoint
CREATE TYPE "public"."repro_attempt_outcome" AS ENUM('reproduced', 'not_reproducible', 'agent_error', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."repro_attempt_status" AS ENUM('queued', 'issue_created', 'agent_requested', 'running', 'completed', 'failed', 'timed_out');--> statement-breakpoint
CREATE TYPE "public"."step_execution_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'skipped', 'failed_timeout');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('lowest', 'low', 'medium', 'high', 'highest');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('needs_more_information', 'needs_triage', 'triaged_backlog', 'in_progress', 'ops_resolution_needed', 'done');--> statement-breakpoint
CREATE TABLE "environments" (
	"id" serial PRIMARY KEY NOT NULL,
	"environment_key" text NOT NULL,
	"area" "environment_area" NOT NULL,
	"number" integer NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environments_environment_key_unique" UNIQUE("environment_key")
);
--> statement-breakpoint
CREATE TABLE "failing_test_repro_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"step_execution_id" integer NOT NULL,
	"status" "repro_attempt_status" DEFAULT 'queued' NOT NULL,
	"outcome" "repro_attempt_outcome",
	"idempotency_key" text NOT NULL,
	"github_issue_number" integer,
	"github_issue_id" text,
	"github_agent_run_id" text,
	"agent_summary" text,
	"failing_test_path" text,
	"failing_test_commit_sha" text,
	"failure_reason" text,
	"raw_result_json" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_description_quality_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"step_execution_id" text NOT NULL,
	"steps_to_reproduce_score" integer NOT NULL,
	"expected_behavior_score" integer NOT NULL,
	"observed_behavior_score" integer NOT NULL,
	"reasoning" text NOT NULL,
	"raw_response" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_duplicate_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"candidate_ticket_id" text NOT NULL,
	"score" numeric(5, 4) NOT NULL,
	"status" "duplicate_candidate_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ticket_duplicate_candidates_pair_order" CHECK ("ticket_duplicate_candidates"."ticket_id" <> "ticket_duplicate_candidates"."candidate_ticket_id"),
	CONSTRAINT "ticket_duplicate_candidates_score_range" CHECK ("ticket_duplicate_candidates"."score" >= 0 and "ticket_duplicate_candidates"."score" <= 1)
);
--> statement-breakpoint
CREATE TABLE "ticket_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"model" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_step_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"step_name" text NOT NULL,
	"status" "step_execution_status" NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_number" text NOT NULL,
	"title" text NOT NULL,
	"slack_thread" text,
	"status" "ticket_status" NOT NULL,
	"description" text NOT NULL,
	"company_names" text[] DEFAULT '{}' NOT NULL,
	"employee_emails" text[] DEFAULT '{}' NOT NULL,
	"priority" "ticket_priority" NOT NULL,
	"due_date" date,
	"reporter" text NOT NULL,
	"assignee" text,
	"jira_created_at" timestamp with time zone,
	"jira_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
ALTER TABLE "failing_test_repro_attempts" ADD CONSTRAINT "failing_test_repro_attempts_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failing_test_repro_attempts" ADD CONSTRAINT "failing_test_repro_attempts_step_execution_id_ticket_step_executions_id_fk" FOREIGN KEY ("step_execution_id") REFERENCES "public"."ticket_step_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_description_quality_assessments" ADD CONSTRAINT "ticket_description_quality_assessments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_duplicate_candidates" ADD CONSTRAINT "ticket_duplicate_candidates_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_duplicate_candidates" ADD CONSTRAINT "ticket_duplicate_candidates_candidate_ticket_id_tickets_id_fk" FOREIGN KEY ("candidate_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_embeddings" ADD CONSTRAINT "ticket_embeddings_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_step_executions" ADD CONSTRAINT "ticket_step_executions_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "failing_test_repro_attempts_idempotency_key_unique" ON "failing_test_repro_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_duplicate_candidates_pair_unique" ON "ticket_duplicate_candidates" USING btree ("ticket_id","candidate_ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_embeddings_ticket_id_unique" ON "ticket_embeddings" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_step_executions_idempotency_key_unique" ON "ticket_step_executions" USING btree ("idempotency_key");