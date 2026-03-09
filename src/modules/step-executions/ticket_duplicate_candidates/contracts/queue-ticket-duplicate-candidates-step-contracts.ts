import { z } from "zod";
import {
  stepExecutionContractSchema,
  ticketDuplicateCandidatesStepResultContractSchema,
  type StepExecutionContract,
  type TicketDuplicateCandidatesStepResultContract,
} from "@/modules/step-executions/contracts/step-execution-contracts";

export const queueTicketDuplicateCandidatesStepRequestSchema = z.object({
  ticketId: z.string().min(1),
});

export const queueTicketDuplicateCandidatesStepResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    stepExecution: stepExecutionContractSchema,
  }),
});

export type QueueTicketDuplicateCandidatesStepRequest = z.infer<
  typeof queueTicketDuplicateCandidatesStepRequestSchema
>;

export {
  ticketDuplicateCandidatesStepResultContractSchema,
  type TicketDuplicateCandidatesStepResultContract,
  type StepExecutionContract,
};

export type QueueTicketDuplicateCandidatesStepResponse = z.infer<
  typeof queueTicketDuplicateCandidatesStepResponseSchema
>;
