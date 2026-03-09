import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const executeQueuedStepExecutionRequestSchema = z.object({
  stepExecutionId: z.string().min(1),
});

export const executeQueuedStepExecutionResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema.nullable(),
  }),
});

export type ExecuteQueuedStepExecutionRequest = z.infer<
  typeof executeQueuedStepExecutionRequestSchema
>;

export type ExecuteQueuedStepExecutionResponse = z.infer<
  typeof executeQueuedStepExecutionResponseSchema
>;
