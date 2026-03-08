import { StepExecutionStepName } from "@/modules/step-executions/domain/step-execution.types";

export class PipelineRunEntity {
  constructor(
    public id: number,
    public ticketId: string,
    public status: PipelineRunStatus,
    public currentStepName: StepExecutionStepName | null,
    public currentStepExecutionId: number | null,
    public lastCompletedStepName: StepExecutionStepName | null,
    public haltReason: string | null,
    public startedAt: Date,
    public endedAt: Date | null = null,
    public createdAt: Date,
    public updatedAt: Date,
  ) {}
}

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
