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

export const getPipelineRuns = async (
  rawQuery: PipelineRunsQuery,
  { pipelineRunRepo }: { pipelineRunRepo: PipelineRunRepo } = AppContext,
): Promise<PaginatedPipelineRunsResponse> => {
  const query = pipelineRunsQuerySchema.parse(rawQuery);
  const [runs, total] = await Promise.all([
    pipelineRunRepo.loadPage(query),
    pipelineRunRepo.count(),
  ]);

  const items = await Promise.all(
    runs.map(async (run) =>
      pipelineRunEntityToContract(run, await pipelineRunRepo.loadExecutions(run.id)),
    ),
  );

  return paginatedPipelineRunsResponseSchema.parse({
    items,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
    },
  });
};
