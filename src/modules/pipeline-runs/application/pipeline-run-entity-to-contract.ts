import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import type { PipelineRunContract } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { pipelineRunSchema } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import type { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";

export function pipelineRunEntityToContract(
  pipelineRun: PipelineRunEntity,
): PipelineRunContract {
  return pipelineRunSchema.parse({
    pipelineRunId: pipelineRun.id,
    ticketId: pipelineRun.ticketId,
    status: pipelineRun.status,
    currentStepName: pipelineRun.currentStepName,
    currentStepExecutionId: pipelineRun.currentStepExecutionId,
    lastCompletedStepName: pipelineRun.lastCompletedStepName,
    haltReason: pipelineRun.haltReason,
    startedAt: pipelineRun.startedAt.toISOString(),
    endedAt: pipelineRun.endedAt?.toISOString() ?? null,
    stepExecutions:
      pipelineRun.pipelineSteps?.map(stepExecutionEntityToContract) ?? [],
  });
}
