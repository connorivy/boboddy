"use server";

import { AppContext } from "@/lib/di";
import {
  createPipelineRunsRequestSchema,
  type CreatePipelineRunsRequest,
  type PipelineRunContract,
} from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import { pipelineRunEntityToContract } from "./pipeline-run-entity-to-contract";
import type { PipelineRunRepo } from "./pipeline-run-repo";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

export async function createPipelineRuns(
  rawRequest: CreatePipelineRunsRequest,
  {
    pipelineRunRepo,
    stepExecutionRepo,
  }: {
    pipelineRunRepo: PipelineRunRepo;
    stepExecutionRepo: StepExecutionRepo;
  } = AppContext,
): Promise<PipelineRunContract[]> {
  const request = createPipelineRunsRequestSchema.parse(rawRequest);
  const now = new Date();
  const pipelineRuns = request.pipelineRuns.map((pipelineRun) =>
    PipelineRunEntity.createAndQueueFirstStep({
      id: pipelineRun.pipelineRunId,
      ticketId: pipelineRun.ticketId,
      status: pipelineRun.status,
      currentStepName: pipelineRun.currentStepName ?? null,
      currentStepExecutionId: pipelineRun.currentStepExecutionId ?? null,
      lastCompletedStepName: pipelineRun.lastCompletedStepName ?? null,
      haltReason: pipelineRun.haltReason ?? null,
      startedAt: new Date(pipelineRun.startedAt),
      endedAt: pipelineRun.endedAt ? new Date(pipelineRun.endedAt) : null,
      createdAt: pipelineRun.createdAt ? new Date(pipelineRun.createdAt) : now,
      updatedAt: pipelineRun.updatedAt ? new Date(pipelineRun.updatedAt) : now,
    }),
  );

  const createdRuns = await pipelineRunRepo.createMany(pipelineRuns);

  const pipelineRunById = new Map(
    pipelineRuns.map((pipelineRun) => [pipelineRun.id, pipelineRun]),
  );

  const createdRunsWithFirstStep = await Promise.all(
    createdRuns.map(async (createdRun) => {
      const unsavedFirstStep =
        pipelineRunById.get(createdRun.id)?.pipelineSteps?.[0] ?? null;
      if (!unsavedFirstStep) {
        return createdRun;
      }

      const firstStep = await stepExecutionRepo.save(unsavedFirstStep);
      createdRun.currentStepName = firstStep.stepName;
      createdRun.currentStepExecutionId = firstStep.id ?? null;
      createdRun.updatedAt = now;
      const updatedRun = await pipelineRunRepo.save(createdRun);

      return new PipelineRunEntity(
        updatedRun.id,
        updatedRun.ticketId,
        updatedRun.status,
        updatedRun.currentStepName,
        updatedRun.currentStepExecutionId,
        updatedRun.lastCompletedStepName,
        updatedRun.haltReason,
        updatedRun.startedAt,
        updatedRun.endedAt,
        updatedRun.createdAt,
        updatedRun.updatedAt,
        [firstStep],
      );
    }),
  );

  return createdRunsWithFirstStep.map(pipelineRunEntityToContract);
}
