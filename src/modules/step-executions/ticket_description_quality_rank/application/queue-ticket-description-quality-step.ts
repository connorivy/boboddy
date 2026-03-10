"use server";

import {
  queueTicketDescriptionQualityStepRequestSchema,
  queueTicketDescriptionQualityStepResponseSchema,
  type QueueTicketDescriptionQualityStepRequest,
  type QueueTicketDescriptionQualityStepResponse,
} from "@/modules/step-executions/ticket_description_quality_rank/contracts/queue-ticket-description-quality-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import { AppContext } from "@/lib/di";
import { TicketDescriptionQualityStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import type { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

export const queueTicketDescriptionQualityStep = async (
  rawInput: QueueTicketDescriptionQualityStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
  }: {
    ticketRepo: Pick<TicketRepo, "loadById">;
    stepExecutionRepo: StepExecutionRepo;
  } = AppContext,
): Promise<QueueTicketDescriptionQualityStepResponse> => {
  const input = queueTicketDescriptionQualityStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const queuedAt = AppContext.timeProvider.now();
  const execution = new TicketDescriptionQualityStepExecutionEntity(
    null,
    input.ticketId,
    "queued",
    null,
    queuedAt,
  );

  const savedExecution = await stepExecutionRepo.save(execution);

  return queueTicketDescriptionQualityStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
