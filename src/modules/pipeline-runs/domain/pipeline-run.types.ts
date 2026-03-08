export const PIPELINE_RUN_STATUSES = [
  "queued",
  "running",
  "waiting",
  "halted",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUSES)[number];

export const ACTIVE_PIPELINE_RUN_STATUSES: ReadonlySet<PipelineRunStatus> =
  new Set(["queued", "running", "waiting", "halted"]);
