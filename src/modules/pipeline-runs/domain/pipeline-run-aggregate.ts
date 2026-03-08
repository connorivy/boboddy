import { StepExecutionStepName } from "@/modules/step-executions/domain/step-execution.types";
import { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";

export class PipelineRunEntity {
  constructor(
    public id: string,
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
    public readonly pipelineSteps?: TicketPipelineStepExecutionEntity[],
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
