import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const queueTicketFailingTestReproStepRequestSchema = z.object({
  ticketId: z.string().min(1),
});

export const queueTicketFailingTestReproStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type QueueTicketFailingTestReproStepRequest = z.infer<
  typeof queueTicketFailingTestReproStepRequestSchema
>;

export type QueueTicketFailingTestReproStepResponse = z.infer<
  typeof queueTicketFailingTestReproStepResponseSchema
>;
