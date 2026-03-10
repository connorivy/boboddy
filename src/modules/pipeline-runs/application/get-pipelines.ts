"use server";

import { AppContext } from "@/lib/di";
import { pipelineRunEntityToContract } from "@/modules/pipeline-runs/application/pipeline-run-entity-to-contract";
import type { PipelineRunRepo } from "@/modules/pipeline-runs/application/pipeline-run-repo";
import {
  paginatedPipelineRunsResponseSchema,
  pipelineRunsQuerySchema,
  type PaginatedPipelineRunsResponse,
  type PipelineRunsQuery,
} from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";

export async function getPipelines(
  rawQuery: PipelineRunsQuery,
  { pipelineRunRepo }: { pipelineRunRepo: PipelineRunRepo } = AppContext,
): Promise<PaginatedPipelineRunsResponse> {
  const query = pipelineRunsQuerySchema.parse(rawQuery);

  const [pipelineRuns, total] = await Promise.all([
    pipelineRunRepo.loadPage(query),
    pipelineRunRepo.count(query),
  ]);

  return paginatedPipelineRunsResponseSchema.parse({
    items: pipelineRuns.map(pipelineRunEntityToContract),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
    },
  });
}
