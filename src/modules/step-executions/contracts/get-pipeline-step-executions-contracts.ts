import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const pipelineStepExecutionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().default(""),
});

export const paginatedPipelineStepExecutionsResponseSchema = z.object({
  items: z.array(stepExecutionContractSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export type PipelineStepExecutionsQuery = z.infer<
  typeof pipelineStepExecutionsQuerySchema
>;
export type PaginatedPipelineStepExecutionsResponse = z.infer<
  typeof paginatedPipelineStepExecutionsResponseSchema
>;
