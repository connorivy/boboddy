import { z } from "zod";
import {
  stepExecutionContractSchema,
  ticketDuplicateCandidatesStepResultContractSchema,
  type StepExecutionContract,
  type TicketDuplicateCandidatesStepResultContract,
} from "@/modules/step-executions/contracts/step-execution-contracts";

export const triggerTicketDuplicateCandidatesStepRequestSchema = z.object({
  ticketId: z.string().min(1),
});

export const triggerTicketDuplicateCandidatesStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type TriggerTicketDuplicateCandidatesStepRequest = z.infer<
  typeof triggerTicketDuplicateCandidatesStepRequestSchema
>;

export {
  ticketDuplicateCandidatesStepResultContractSchema,
  type TicketDuplicateCandidatesStepResultContract,
  type StepExecutionContract,
};

export type TriggerTicketDuplicateCandidatesStepResponse = z.infer<
  typeof triggerTicketDuplicateCandidatesStepResponseSchema
>;
