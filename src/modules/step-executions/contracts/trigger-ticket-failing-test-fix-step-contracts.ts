import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const triggerTicketFailingTestFixStepRequestSchema = z.object({
  ticketNumber: z.string().trim().min(1),
  ticketGitEnvironmentId: z.number().int().positive(),
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
