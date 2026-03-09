import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const queueTicketDescriptionEnrichmentStepRequestSchema = z.object({
  ticketId: z.string().min(1),
});

export const queueTicketDescriptionEnrichmentStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type QueueTicketDescriptionEnrichmentStepRequest = z.infer<
  typeof queueTicketDescriptionEnrichmentStepRequestSchema
>;

export type QueueTicketDescriptionEnrichmentStepResponse = z.infer<
  typeof queueTicketDescriptionEnrichmentStepResponseSchema
>;
