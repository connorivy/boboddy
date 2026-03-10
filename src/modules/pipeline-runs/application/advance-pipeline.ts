import { AppContext } from "@/lib/di";
import { type PipelineRunContract } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { pipelineRunEntityToContract } from "./pipeline-run-entity-to-contract";
import type { PipelineRunRepo } from "./pipeline-run-repo";
import { httpError } from "@/lib/api/http";
import { PipelineAdvancementPolicy } from "../domain/pipeline-advancement-policy";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

export async function advancePipeline(
  pipelineRunId: string,
  {
    pipelineAdvancementPolicy,
    pipelineRunRepo,
    stepExecutionRepo,
  }: {
    pipelineAdvancementPolicy: PipelineAdvancementPolicy;
    pipelineRunRepo: PipelineRunRepo;
    stepExecutionRepo: StepExecutionRepo;
  } = {
    pipelineAdvancementPolicy: new PipelineAdvancementPolicy(
      AppContext.timeProvider,
    ),
    ...AppContext,
  },
): Promise<PipelineRunContract> {
  const pipelineRun = await pipelineRunRepo.loadById(pipelineRunId, {
    includePipelineSteps: true,
  });
  if (!pipelineRun) {
    throw httpError(`Pipeline run with ID ${pipelineRunId} not found`, 404);
  }

  const nextStepExecution =
    pipelineAdvancementPolicy.createNextStepExecution(pipelineRun);

  if (!nextStepExecution) {
    return pipelineRunEntityToContract(pipelineRun);
  }

  await stepExecutionRepo.save(nextStepExecution);
  const refreshedPipelineRun = await pipelineRunRepo.loadById(pipelineRun.id, {
    includePipelineSteps: true,
  });

  if (!refreshedPipelineRun) {
    throw httpError(`Pipeline run with ID ${pipelineRunId} not found`, 404);
  }

  return pipelineRunEntityToContract(refreshedPipelineRun);
}
