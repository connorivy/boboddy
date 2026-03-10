import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const pipelineRunSchema = z.object({
  pipelineRunId: z.string().min(1),
  ticketId: z.string().min(1),
  stepExecutions: z.array(stepExecutionContractSchema).nullable(),
});

export const advancePipelineStepRequestSchema = z.object({
  ticketId: z.string().trim().min(1),
  pipelineRunId: z.string().trim().min(1).optional(),
});

export const createPipelineRunRequestSchema = z.object({
  ticketId: z.string().trim().min(1),
});

export const createPipelineRunsRequestSchema = z.object({
  pipelineRuns: z.array(createPipelineRunRequestSchema).min(1),
});

export const advancePipelineStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    pipeline: pipelineRunSchema,
  }),
});

export const pipelineRunsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const paginatedPipelineRunsResponseSchema = z.object({
  items: z.array(pipelineRunSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export type PipelineRunContract = z.infer<typeof pipelineRunSchema>;
export type AdvancePipelineStepRequest = z.infer<
  typeof advancePipelineStepRequestSchema
>;
export type CreatePipelineRunRequest = z.infer<
  typeof createPipelineRunRequestSchema
>;
export type CreatePipelineRunsRequest = z.infer<
  typeof createPipelineRunsRequestSchema
>;
export type AdvancePipelineStepResponse = z.infer<
  typeof advancePipelineStepResponseSchema
>;
export type PipelineRunsQuery = z.infer<typeof pipelineRunsQuerySchema>;
export type PaginatedPipelineRunsResponse = z.infer<
  typeof paginatedPipelineRunsResponseSchema
>;
