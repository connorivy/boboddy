import { z } from "zod";
import { stepExecutionContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";

export const triggerFinalizeFailingTestReproPrStepRequestSchema = z.object({
  ticketId: z.string().trim().min(1),
});

export const triggerFinalizeFailingTestReproPrStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type TriggerFinalizeFailingTestReproPrStepRequest = z.infer<
  typeof triggerFinalizeFailingTestReproPrStepRequestSchema
>;

export type TriggerFinalizeFailingTestReproPrStepResponse = z.infer<
  typeof triggerFinalizeFailingTestReproPrStepResponseSchema
>;
