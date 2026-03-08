import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const triggerTicketDescriptionEnrichmentStepRequestSchema = z.object({
  ticketId: z.string().min(1),
  pipelineRunId: z.string().min(1),
});

export const triggerTicketDescriptionEnrichmentStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type TriggerTicketDescriptionEnrichmentStepRequest = z.infer<
  typeof triggerTicketDescriptionEnrichmentStepRequestSchema
>;

export type TriggerTicketDescriptionEnrichmentStepResponse = z.infer<
  typeof triggerTicketDescriptionEnrichmentStepResponseSchema
>;
