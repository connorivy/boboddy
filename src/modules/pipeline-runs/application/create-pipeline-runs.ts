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
  const pipelineRuns = request.pipelineRuns.map((pipelineRun) =>
    PipelineRunEntity.createAndQueueFirstStep({
      ticketId: pipelineRun.ticketId,
      queuedAt: new Date(),
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
      return new PipelineRunEntity(createdRun.id, createdRun.ticketId, [
        firstStep,
      ]);
    }),
  );

  return createdRunsWithFirstStep.map(pipelineRunEntityToContract);
}
