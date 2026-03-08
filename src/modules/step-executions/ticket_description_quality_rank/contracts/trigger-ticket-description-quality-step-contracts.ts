import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const triggerTicketDescriptionQualityStepRequestSchema = z.object({
  ticketId: z.string().min(1),
});

export const triggerTicketDescriptionQualityStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type TriggerTicketDescriptionQualityStepRequest = z.infer<
  typeof triggerTicketDescriptionQualityStepRequestSchema
>;

export type TriggerTicketDescriptionQualityStepResponse = z.infer<
  typeof triggerTicketDescriptionQualityStepResponseSchema
>;
