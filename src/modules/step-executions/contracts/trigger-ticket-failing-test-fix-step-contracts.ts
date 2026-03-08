import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const triggerTicketFailingTestFixStepRequestSchema = z.object({
  ticketId: z.string().trim().min(1),
  pipelineRunId: z.string().trim().min(1),
});

export const triggerTicketFailingTestFixStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type TriggerTicketFailingTestFixStepRequest = z.infer<
  typeof triggerTicketFailingTestFixStepRequestSchema
>;

export type TriggerTicketFailingTestFixStepResponse = z.infer<
  typeof triggerTicketFailingTestFixStepResponseSchema
>;
