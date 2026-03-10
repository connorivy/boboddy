"use server";

import { AppContext } from "@/lib/di";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  paginatedPipelineStepExecutionsResponseSchema,
  pipelineStepExecutionsQuerySchema,
  type PaginatedPipelineStepExecutionsResponse,
  type PipelineStepExecutionsQuery,
} from "@/modules/step-executions/contracts/get-pipeline-step-executions-contracts";

export async function getPipelineStepExecutions(
  rawQuery: PipelineStepExecutionsQuery,
  { stepExecutionRepo }: { stepExecutionRepo: StepExecutionRepo } = AppContext,
): Promise<PaginatedPipelineStepExecutionsResponse> {
  const query = pipelineStepExecutionsQuerySchema.parse(rawQuery);

  const [stepExecutions, total] = await Promise.all([
    stepExecutionRepo.loadPage(query),
    stepExecutionRepo.count(query),
  ]);

  return paginatedPipelineStepExecutionsResponseSchema.parse({
    items: stepExecutions.map(stepExecutionEntityToContract),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
    },
  });
}
