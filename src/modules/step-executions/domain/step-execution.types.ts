export const STEP_EXECUTION_STATUSES = [
  "not_started",
  "queued",
  "running",
  "waiting_for_user_feedback",
  "succeeded",
  "failed",
  "skipped",
  "failed_timeout",
] as const;

export type StepExecutionStatus = (typeof STEP_EXECUTION_STATUSES)[number];

export type StepExecutionStepName = string;

export const TICKET_DESCRIPTION_QUALITY_STEP_NAME =
  "ticket_description_quality_rank";
export const TICKET_INVESTIGATION_STEP_NAME = "ticket_investigation";
export const FAILING_TEST_REPRO_STEP_NAME = "github_repro_failing_test";
export const FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME =
  "github_finalize_repro_pr";
export const FAILING_TEST_FIX_STEP_NAME = "github_fix_failing_test";
export const TICKET_DUPLICATE_CANDIDATES_STEP_NAME =
  "ticket_duplicate_candidates";

export const TERMINAL_STEP_EXECUTION_STATUSES: ReadonlySet<StepExecutionStatus> =
  new Set(["succeeded", "failed", "skipped", "failed_timeout"]);
