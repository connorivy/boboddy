CREATE TYPE "public"."agent_status" AS ENUM('complete', 'error', 'abort', 'timeout', 'user_exit');--> statement-breakpoint
CREATE TYPE "public"."environment_area" AS ENUM('adm', 'mem', 'ps');--> statement-breakpoint
CREATE TYPE "public"."github_merge_status" AS ENUM('draft', 'open', 'closed', 'merged');--> statement-breakpoint
CREATE TYPE "public"."repro_attempt_outcome" AS ENUM('reproduced', 'not_reproducible', 'needs_user_feedback', 'agent_error', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."repro_attempt_status" AS ENUM('queued', 'issue_created', 'agent_requested', 'running', 'completed', 'failed', 'timed_out');--> statement-breakpoint
CREATE TYPE "public"."step_execution_status" AS ENUM('not_started', 'queued', 'running', 'waiting_for_user_feedback', 'succeeded', 'failed', 'skipped', 'failed_timeout');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('lowest', 'low', 'medium', 'high', 'highest');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('needs_more_information', 'needs_triage', 'triaged_backlog', 'in_progress', 'ops_resolution_needed', 'done');--> statement-breakpoint
CREATE TYPE "public"."ticket_type" AS ENUM('bug', 'manual support', 'enhancement', 'report request');--> statement-breakpoint
CREATE TABLE "environments" (
	"id" serial PRIMARY KEY NOT NULL,
	"environment_key" text NOT NULL,
	"area" "environment_area" NOT NULL,
	"number" integer NOT NULL,
	"region" text DEFAULT 'unknown' NOT NULL,
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
	"agent_status" "agent_status",
	"github_merge_status" "github_merge_status" DEFAULT 'draft' NOT NULL,
	"github_pr_target_branch" text,
	"agent_branch" text,
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
CREATE TABLE "pipeline_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL
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
CREATE TABLE "ticket_git_environments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"base_environment_id" text NOT NULL,
	"dev_branch" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_github_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"github_issue_number" integer NOT NULL,
	"github_issue_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_step_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
	"step_name" text NOT NULL,
	"status" "step_execution_status" NOT NULL,
	"idempotency_key" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_step_executions_tph" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
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
	"agent_status" "agent_status",
	"github_merge_status" "github_merge_status",
	"github_pr_target_branch" text,
	"agent_branch" text,
	"agent_summary" text,
	"failing_test_path" text,
	"failing_test_commit_sha" text,
	"failure_reason" text,
	"summary_of_findings" text,
	"confidence_level" real,
	"raw_result_json" jsonb,
	"completed_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"fix_operation_outcome" text,
	"fixed_test_path" text,
	"summary_of_fix" text,
	"fix_confidence_level" real,
	"duplicate_candidates_proposed" text,
	"duplicate_candidates_dismissed" text,
	"duplicate_candidates_promoted" text
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
	"ticket_type" "ticket_type" DEFAULT 'manual support' NOT NULL,
	"due_date" date,
	"reporter" text NOT NULL,
	"assignee" text,
	"default_git_environment_id" integer,
	"jira_created_at" timestamp with time zone,
	"jira_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
ALTER TABLE "failing_test_repro_attempts" ADD CONSTRAINT "failing_test_repro_attempts_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "failing_test_repro_attempts" ADD CONSTRAINT "failing_test_repro_attempts_step_execution_id_ticket_step_executions_id_fk" FOREIGN KEY ("step_execution_id") REFERENCES "public"."ticket_step_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_description_quality_assessments" ADD CONSTRAINT "ticket_description_quality_assessments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_embeddings" ADD CONSTRAINT "ticket_embeddings_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_git_environments" ADD CONSTRAINT "ticket_git_environments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_git_environments" ADD CONSTRAINT "ticket_git_environments_base_environment_id_environments_environment_key_fk" FOREIGN KEY ("base_environment_id") REFERENCES "public"."environments"("environment_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_github_issues" ADD CONSTRAINT "ticket_github_issues_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_default_git_environment_id_ticket_git_environments_id_fk" FOREIGN KEY ("default_git_environment_id") REFERENCES "public"."ticket_git_environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "failing_test_repro_attempts_idempotency_key_unique" ON "failing_test_repro_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_embeddings_ticket_id_unique" ON "ticket_embeddings" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_github_issues_ticket_id_unique" ON "ticket_github_issues" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_step_executions_idempotency_key_unique" ON "ticket_step_executions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_step_executions_tph_idempotency_key_unique" ON "ticket_step_executions_tph" USING btree ("idempotency_key");