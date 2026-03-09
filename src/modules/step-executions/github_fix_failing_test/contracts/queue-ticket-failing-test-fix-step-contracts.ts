import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const queueTicketFailingTestFixStepRequestSchema = z.object({
  ticketId: z.string().min(1),
});

export const queueTicketFailingTestFixStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type QueueTicketFailingTestFixStepRequest = z.infer<
  typeof queueTicketFailingTestFixStepRequestSchema
>;

export type QueueTicketFailingTestFixStepResponse = z.infer<
  typeof queueTicketFailingTestFixStepResponseSchema
>;
