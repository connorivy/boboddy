import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const queueTicketDescriptionQualityStepRequestSchema = z.object({
  ticketId: z.string().min(1),
});

export const queueTicketDescriptionQualityStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type QueueTicketDescriptionQualityStepRequest = z.infer<
  typeof queueTicketDescriptionQualityStepRequestSchema
>;

export type QueueTicketDescriptionQualityStepResponse = z.infer<
  typeof queueTicketDescriptionQualityStepResponseSchema
>;
