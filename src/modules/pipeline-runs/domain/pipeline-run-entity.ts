import type { StepExecutionStepName } from "@/modules/step-executions/domain/step-execution.types";
import type { PipelineRunStatus } from "@/modules/pipeline-runs/domain/pipeline-run.types";

export class PipelineRunEntity {
  constructor(
    public id: string,
    public ticketId: string,
    public status: PipelineRunStatus,
    public currentStepName: StepExecutionStepName | null,
    public currentStepExecutionId: number | null,
    public lastCompletedStepName: StepExecutionStepName | null,
    public haltReason: string | null,
    public startedAt: string,
    public endedAt: string | null = null,
    public pipelineType: string = "default",
    public definitionVersion: number = 1,
    public createdAt?: string,
    public updatedAt?: string,
  ) {}
}
