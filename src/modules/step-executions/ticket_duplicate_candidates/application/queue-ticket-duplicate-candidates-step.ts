"use server";

import {
  queueTicketDuplicateCandidatesStepRequestSchema,
  queueTicketDuplicateCandidatesStepResponseSchema,
  type QueueTicketDuplicateCandidatesStepRequest,
  type QueueTicketDuplicateCandidatesStepResponse,
} from "@/modules/step-executions/ticket_duplicate_candidates/contracts/queue-ticket-duplicate-candidates-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import { AppContext } from "@/lib/di";
import type { TimeProvider } from "@/lib/time-provider";
import { TicketDuplicateCandidatesStepResultEntity } from "@/modules/step-executions/domain/step-execution-entity";
import type { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

export const queueTicketDuplicateCandidatesStep = async (
  rawInput: QueueTicketDuplicateCandidatesStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
    timeProvider,
  }: {
    ticketRepo: Pick<TicketRepo, "loadById">;
    stepExecutionRepo: StepExecutionRepo;
    timeProvider: TimeProvider;
  } = AppContext,
): Promise<QueueTicketDuplicateCandidatesStepResponse> => {
  const input =
    queueTicketDuplicateCandidatesStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const queuedAt = timeProvider.now();
  const execution = new TicketDuplicateCandidatesStepResultEntity(
    null,
    input.ticketId,
    "queued",
    null,
    queuedAt,
  );

  const savedExecution = await stepExecutionRepo.save(execution);

  return queueTicketDuplicateCandidatesStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
