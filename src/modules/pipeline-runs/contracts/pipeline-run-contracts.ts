import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import { PIPELINE_RUN_STATUSES } from "@/modules/pipeline-runs/domain/pipeline-run.types";

export const pipelineRunStatusSchema = z.enum(PIPELINE_RUN_STATUSES);

export const pipelineRunStateSchema = z.object({
  pipelineRunId: z.string().min(1),
  ticketId: z.string().min(1),
  status: pipelineRunStatusSchema,
  currentStepName: z.string().min(1).nullable(),
  currentStepExecutionId: z.number().int().positive().nullable(),
  lastCompletedStepName: z.string().min(1).nullable(),
  haltReason: z.string().min(1).nullable(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  pipelineType: z.string().min(1),
  definitionVersion: z.number().int().positive(),
  stepExecutions: z.array(stepExecutionContractSchema),
});

export const advancePipelineStepRequestSchema = z.object({
  ticketId: z.string().trim().min(1),
  pipelineRunId: z.string().trim().min(1).optional(),
});

export const advancePipelineStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    pipeline: pipelineRunStateSchema,
  }),
});

export const pipelineRunsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const paginatedPipelineRunsResponseSchema = z.object({
  items: z.array(pipelineRunStateSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});

export type PipelineRunState = z.infer<typeof pipelineRunStateSchema>;
export type AdvancePipelineStepRequest = z.infer<
  typeof advancePipelineStepRequestSchema
>;
export type AdvancePipelineStepResponse = z.infer<
  typeof advancePipelineStepResponseSchema
>;
export type PipelineRunsQuery = z.infer<typeof pipelineRunsQuerySchema>;
export type PaginatedPipelineRunsResponse = z.infer<
  typeof paginatedPipelineRunsResponseSchema
>;
