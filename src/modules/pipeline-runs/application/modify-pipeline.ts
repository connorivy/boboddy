"use server";

import { httpError } from "@/lib/api/http";
import { AppContext } from "@/lib/di";
import {
  modifyPipelineRequestSchema,
  type ModifyPipelineRequest,
  type PipelineRunContract,
} from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import { pipelineRunEntityToContract } from "./pipeline-run-entity-to-contract";
import type { PipelineRunRepo } from "./pipeline-run-repo";

export async function modifyPipeline(
  rawRequest: ModifyPipelineRequest,
  { pipelineRunRepo }: { pipelineRunRepo: PipelineRunRepo } = AppContext,
): Promise<PipelineRunContract> {
  const request = modifyPipelineRequestSchema.parse(rawRequest);
  const pipelineRun = await pipelineRunRepo.loadById(request.pipelineRunId, {
    includePipelineSteps: true,
  });

  if (!pipelineRun) {
    throw httpError(
      `Pipeline run with ID ${request.pipelineRunId} not found`,
      404,
    );
  }

  await pipelineRunRepo.save(
    new PipelineRunEntity(
      pipelineRun.id,
      pipelineRun.ticketId,
      request.autoAdvance,
      pipelineRun.pipelineSteps,
    ),
  );

  const updatedPipelineRun = await pipelineRunRepo.loadById(request.pipelineRunId, {
    includePipelineSteps: true,
  });

  if (!updatedPipelineRun) {
    throw httpError(
      `Pipeline run with ID ${request.pipelineRunId} not found`,
      404,
    );
  }

  return pipelineRunEntityToContract(updatedPipelineRun);
}
