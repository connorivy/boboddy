-- Add the TPH table + enum value when missing, then backfill from legacy tables.
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
--> statement-breakpoint

-- Backfill ticket_step_executions_tph from legacy step execution tables.
-- Still ignores failing_test_repro_attempts.

DO $$
DECLARE
  step_schema text;
  step_table text;
  assess_schema text;
  assess_table text;
  step_ref text;
  assess_ref text;
  step_is_snake boolean;
  assess_is_snake boolean;
  rows_written bigint := 0;
  step_source_rows bigint := 0;
  candidate_count bigint;
  candidate record;
BEGIN
  IF to_regclass('public.ticket_step_executions_tph') IS NULL THEN
    RAISE NOTICE 'Skipping backfill: target table public.ticket_step_executions_tph does not exist.';
    RETURN;
  END IF;

  -- Pick the legacy step table that actually has the most rows.
  FOR candidate IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND lower(c.relname) IN ('ticket_step_executions', 'ticketstepexecutions')
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I', candidate.schema_name, candidate.table_name)
    INTO candidate_count;

    IF step_table IS NULL OR candidate_count > step_source_rows THEN
      step_schema := candidate.schema_name;
      step_table := candidate.table_name;
      step_source_rows := candidate_count;
    END IF;
  END LOOP;

  IF step_table IS NULL THEN
    RAISE NOTICE 'Skipping backfill: no legacy step execution table found.';
    RETURN;
  END IF;

  -- Prefer assessment table in same schema as the selected step table; fall back to any schema.
  FOR candidate IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND lower(c.relname) IN ('ticket_description_quality_assessments', 'ticketdescriptionqualityassessments')
    ORDER BY CASE WHEN n.nspname = step_schema THEN 0 ELSE 1 END, c.oid
  LOOP
    assess_schema := candidate.schema_name;
    assess_table := candidate.table_name;
    EXIT;
  END LOOP;

  step_ref := format('%I.%I', step_schema, step_table);
  IF assess_table IS NOT NULL THEN
    assess_ref := format('%I.%I', assess_schema, assess_table);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = step_schema
      AND table_name = step_table
      AND column_name = 'ticket_id'
  )
  INTO step_is_snake;

  IF assess_table IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = assess_schema
        AND table_name = assess_table
        AND column_name = 'ticket_id'
    )
    INTO assess_is_snake;
  ELSE
    assess_is_snake := step_is_snake;
  END IF;

  RAISE NOTICE 'Backfill source step table: %.% (rows=%)', step_schema, step_table, step_source_rows;
  IF assess_table IS NOT NULL THEN
    RAISE NOTICE 'Backfill source assessment table: %.%', assess_schema, assess_table;
  ELSE
    RAISE NOTICE 'Backfill source assessment table: (none found)';
  END IF;

  IF step_source_rows = 0 THEN
    RAISE NOTICE 'Selected step source table has 0 rows. Nothing to backfill.';
  END IF;

  IF step_is_snake THEN
    IF assess_table IS NOT NULL AND assess_is_snake THEN
      EXECUTE format(
        $SQL$
        INSERT INTO public.ticket_step_executions_tph (
          ticket_id,
          step_name,
          type,
          status,
          idempotency_key,
          started_at,
          ended_at,
          created_at,
          updated_at,
          steps_to_reproduce_score,
          expected_behavior_score,
          observed_behavior_score,
          reasoning,
          raw_response,
          outcome,
          github_issue_number,
          github_issue_id,
          github_agent_run_id,
          agent_summary,
          failing_test_path,
          failing_test_commit_sha,
          failure_reason,
          raw_result_json,
          completed_at,
          last_polled_at
        )
        SELECT
          tse.ticket_id,
          tse.step_name,
          tse.step_name AS type,
          tse.status,
          tse.idempotency_key,
          tse.started_at,
          tse.ended_at,
          tse.created_at,
          tse.updated_at,
          qa.steps_to_reproduce_score,
          qa.expected_behavior_score,
          qa.observed_behavior_score,
          qa.reasoning,
          qa.raw_response,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
        FROM %s tse
        LEFT JOIN LATERAL (
          SELECT
            tqa.steps_to_reproduce_score,
            tqa.expected_behavior_score,
            tqa.observed_behavior_score,
            tqa.reasoning,
            tqa.raw_response
          FROM %s tqa
          WHERE tqa.ticket_id = tse.ticket_id
            AND tqa.step_execution_id = tse.id::text
          ORDER BY tqa.updated_at DESC, tqa.created_at DESC, tqa.id DESC
          LIMIT 1
        ) qa ON TRUE
        ON CONFLICT (idempotency_key) DO UPDATE
        SET
          ticket_id = EXCLUDED.ticket_id,
          step_name = EXCLUDED.step_name,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          ended_at = EXCLUDED.ended_at,
          updated_at = EXCLUDED.updated_at,
          steps_to_reproduce_score = EXCLUDED.steps_to_reproduce_score,
          expected_behavior_score = EXCLUDED.expected_behavior_score,
          observed_behavior_score = EXCLUDED.observed_behavior_score,
          reasoning = EXCLUDED.reasoning,
          raw_response = EXCLUDED.raw_response,
          outcome = NULL,
          github_issue_number = NULL,
          github_issue_id = NULL,
          github_agent_run_id = NULL,
          agent_summary = NULL,
          failing_test_path = NULL,
          failing_test_commit_sha = NULL,
          failure_reason = NULL,
          raw_result_json = NULL,
          completed_at = NULL,
          last_polled_at = NULL
        $SQL$,
        step_ref,
        assess_ref
      );
    ELSE
      EXECUTE format(
        $SQL$
        INSERT INTO public.ticket_step_executions_tph (
          ticket_id,
          step_name,
          type,
          status,
          idempotency_key,
          started_at,
          ended_at,
          created_at,
          updated_at,
          outcome,
          github_issue_number,
          github_issue_id,
          github_agent_run_id,
          agent_summary,
          failing_test_path,
          failing_test_commit_sha,
          failure_reason,
          raw_result_json,
          completed_at,
          last_polled_at
        )
        SELECT
          tse.ticket_id,
          tse.step_name,
          tse.step_name AS type,
          tse.status,
          tse.idempotency_key,
          tse.started_at,
          tse.ended_at,
          tse.created_at,
          tse.updated_at,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
        FROM %s tse
        ON CONFLICT (idempotency_key) DO UPDATE
        SET
          ticket_id = EXCLUDED.ticket_id,
          step_name = EXCLUDED.step_name,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          ended_at = EXCLUDED.ended_at,
          updated_at = EXCLUDED.updated_at,
          steps_to_reproduce_score = NULL,
          expected_behavior_score = NULL,
          observed_behavior_score = NULL,
          reasoning = NULL,
          raw_response = NULL,
          outcome = NULL,
          github_issue_number = NULL,
          github_issue_id = NULL,
          github_agent_run_id = NULL,
          agent_summary = NULL,
          failing_test_path = NULL,
          failing_test_commit_sha = NULL,
          failure_reason = NULL,
          raw_result_json = NULL,
          completed_at = NULL,
          last_polled_at = NULL
        $SQL$,
        step_ref
      );
    END IF;
  ELSE
    IF assess_table IS NOT NULL AND NOT assess_is_snake THEN
      EXECUTE format(
        $SQL$
        INSERT INTO public.ticket_step_executions_tph (
          ticket_id,
          step_name,
          type,
          status,
          idempotency_key,
          started_at,
          ended_at,
          created_at,
          updated_at,
          steps_to_reproduce_score,
          expected_behavior_score,
          observed_behavior_score,
          reasoning,
          raw_response,
          outcome,
          github_issue_number,
          github_issue_id,
          github_agent_run_id,
          agent_summary,
          failing_test_path,
          failing_test_commit_sha,
          failure_reason,
          raw_result_json,
          completed_at,
          last_polled_at
        )
        SELECT
          tse."ticketId",
          tse."stepName",
          tse."stepName" AS type,
          tse."status"::public.step_execution_status,
          tse."idempotencyKey",
          tse."startedAt",
          tse."endedAt",
          tse."createdAt",
          tse."updatedAt",
          qa."stepsToReproduceScore",
          qa."expectedBehaviorScore",
          qa."observedBehaviorScore",
          qa."reasoning",
          qa."rawResponse",
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
        FROM %s tse
        LEFT JOIN LATERAL (
          SELECT
            tqa."stepsToReproduceScore",
            tqa."expectedBehaviorScore",
            tqa."observedBehaviorScore",
            tqa."reasoning",
            tqa."rawResponse"
          FROM %s tqa
          WHERE tqa."ticketId" = tse."ticketId"
            AND tqa."stepExecutionId" = tse."id"::text
          ORDER BY tqa."updatedAt" DESC, tqa."createdAt" DESC, tqa."id" DESC
          LIMIT 1
        ) qa ON TRUE
        ON CONFLICT (idempotency_key) DO UPDATE
        SET
          ticket_id = EXCLUDED.ticket_id,
          step_name = EXCLUDED.step_name,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          ended_at = EXCLUDED.ended_at,
          updated_at = EXCLUDED.updated_at,
          steps_to_reproduce_score = EXCLUDED.steps_to_reproduce_score,
          expected_behavior_score = EXCLUDED.expected_behavior_score,
          observed_behavior_score = EXCLUDED.observed_behavior_score,
          reasoning = EXCLUDED.reasoning,
          raw_response = EXCLUDED.raw_response,
          outcome = NULL,
          github_issue_number = NULL,
          github_issue_id = NULL,
          github_agent_run_id = NULL,
          agent_summary = NULL,
          failing_test_path = NULL,
          failing_test_commit_sha = NULL,
          failure_reason = NULL,
          raw_result_json = NULL,
          completed_at = NULL,
          last_polled_at = NULL
        $SQL$,
        step_ref,
        assess_ref
      );
    ELSE
      EXECUTE format(
        $SQL$
        INSERT INTO public.ticket_step_executions_tph (
          ticket_id,
          step_name,
          type,
          status,
          idempotency_key,
          started_at,
          ended_at,
          created_at,
          updated_at,
          outcome,
          github_issue_number,
          github_issue_id,
          github_agent_run_id,
          agent_summary,
          failing_test_path,
          failing_test_commit_sha,
          failure_reason,
          raw_result_json,
          completed_at,
          last_polled_at
        )
        SELECT
          tse."ticketId",
          tse."stepName",
          tse."stepName" AS type,
          tse."status"::public.step_execution_status,
          tse."idempotencyKey",
          tse."startedAt",
          tse."endedAt",
          tse."createdAt",
          tse."updatedAt",
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          NULL
        FROM %s tse
        ON CONFLICT (idempotency_key) DO UPDATE
        SET
          ticket_id = EXCLUDED.ticket_id,
          step_name = EXCLUDED.step_name,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          ended_at = EXCLUDED.ended_at,
          updated_at = EXCLUDED.updated_at,
          steps_to_reproduce_score = NULL,
          expected_behavior_score = NULL,
          observed_behavior_score = NULL,
          reasoning = NULL,
          raw_response = NULL,
          outcome = NULL,
          github_issue_number = NULL,
          github_issue_id = NULL,
          github_agent_run_id = NULL,
          agent_summary = NULL,
          failing_test_path = NULL,
          failing_test_commit_sha = NULL,
          failure_reason = NULL,
          raw_result_json = NULL,
          completed_at = NULL,
          last_polled_at = NULL
        $SQL$,
        step_ref
      );
    END IF;
  END IF;

  GET DIAGNOSTICS rows_written = ROW_COUNT;
  RAISE NOTICE 'Backfill rows inserted/updated into ticket_step_executions_tph: %', rows_written;

  PERFORM setval(
    pg_get_serial_sequence('public.ticket_step_executions_tph', 'id'),
    COALESCE((SELECT MAX(id) FROM public.ticket_step_executions_tph), 0) + 1,
    false
  );
END $$;
