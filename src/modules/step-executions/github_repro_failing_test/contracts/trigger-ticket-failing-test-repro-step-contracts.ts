import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const triggerTicketFailingTestReproStepRequestSchema = z.object({
  ticketId: z.string().min(1),
});

export const triggerTicketFailingTestReproStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type TriggerTicketFailingTestReproStepRequest = z.infer<
  typeof triggerTicketFailingTestReproStepRequestSchema
>;

export type TriggerTicketFailingTestReproStepResponse = z.infer<
  typeof triggerTicketFailingTestReproStepResponseSchema
>;
