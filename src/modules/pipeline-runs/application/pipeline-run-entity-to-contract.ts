import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import type { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import {
  pipelineRunStateSchema,
  type PipelineRunState,
} from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import type { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-entity";

export const pipelineRunEntityToContract = (
  run: PipelineRunEntity,
  stepExecutions: TicketPipelineStepExecutionEntity[],
): PipelineRunState =>
  pipelineRunStateSchema.parse({
    pipelineRunId: run.id,
    ticketId: run.ticketId,
    status: run.status,
    currentStepName: run.currentStepName,
    currentStepExecutionId: run.currentStepExecutionId,
    lastCompletedStepName: run.lastCompletedStepName,
    haltReason: run.haltReason,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    pipelineType: run.pipelineType,
    definitionVersion: run.definitionVersion,
    stepExecutions: stepExecutions.map(stepExecutionEntityToContract),
  });
