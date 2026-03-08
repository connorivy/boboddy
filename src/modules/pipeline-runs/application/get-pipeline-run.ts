"use server";

import { AppContext } from "@/lib/di";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import type { PipelineRunContract } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import type { PipelineRunRepo } from "./pipeline-run-repo";
import { pipelineRunEntityToContract } from "./pipeline-run-entity-to-contract";

export async function getPipelineRun(
  pipelineRunId: string,
  {
    pipelineRunRepo,
    stepExecutionRepo,
  }: {
    pipelineRunRepo: PipelineRunRepo;
    stepExecutionRepo: StepExecutionRepo;
  } = AppContext,
): Promise<PipelineRunContract | null> {
  const pipelineRun = await pipelineRunRepo.loadById(pipelineRunId);
  if (!pipelineRun) {
    return null;
  }

  const stepExecutions = await stepExecutionRepo.loadByTicketId(
    pipelineRun.ticketId,
  );

  const pipelineRunWithSteps = new PipelineRunEntity(
    pipelineRun.id,
    pipelineRun.ticketId,
    pipelineRun.status,
    pipelineRun.currentStepName,
    pipelineRun.currentStepExecutionId,
    pipelineRun.lastCompletedStepName,
    pipelineRun.haltReason,
    pipelineRun.startedAt,
    pipelineRun.endedAt,
    pipelineRun.createdAt,
    pipelineRun.updatedAt,
    stepExecutions,
  );

  return pipelineRunEntityToContract(pipelineRunWithSteps);
}
