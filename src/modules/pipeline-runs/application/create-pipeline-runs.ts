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

export async function createPipelineRuns(
  rawRequest: CreatePipelineRunsRequest,
  { pipelineRunRepo }: { pipelineRunRepo: PipelineRunRepo } = AppContext,
): Promise<PipelineRunContract[]> {
  const request = createPipelineRunsRequestSchema.parse(rawRequest);
  const now = new Date();
  const pipelineRuns = request.pipelineRuns.map(
    (pipelineRun) =>
      new PipelineRunEntity(
        pipelineRun.pipelineRunId,
        pipelineRun.ticketId,
        pipelineRun.status,
        pipelineRun.currentStepName ?? null,
        pipelineRun.currentStepExecutionId ?? null,
        pipelineRun.lastCompletedStepName ?? null,
        pipelineRun.haltReason ?? null,
        new Date(pipelineRun.startedAt),
        pipelineRun.endedAt ? new Date(pipelineRun.endedAt) : null,
        pipelineRun.createdAt ? new Date(pipelineRun.createdAt) : now,
        pipelineRun.updatedAt ? new Date(pipelineRun.updatedAt) : now,
      ),
  );

  const createdRuns = await pipelineRunRepo.createMany(pipelineRuns);
  return createdRuns.map(pipelineRunEntityToContract);
}
