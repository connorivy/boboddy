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
    stepExecutions:
      pipelineRun.pipelineSteps?.map(stepExecutionEntityToContract) ?? null,
  });
}
