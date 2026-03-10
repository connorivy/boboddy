"use server";

import {
  queueTicketDescriptionEnrichmentStepRequestSchema,
  queueTicketDescriptionEnrichmentStepResponseSchema,
  type QueueTicketDescriptionEnrichmentStepRequest,
  type QueueTicketDescriptionEnrichmentStepResponse,
} from "@/modules/step-executions/ticket_description_enrichment/contracts/queue-ticket-description-enrichment-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import { AppContext } from "@/lib/di";
import { TicketDescriptionEnrichmentStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import type { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

export const queueTicketDescriptionEnrichmentStep = async (
  rawInput: QueueTicketDescriptionEnrichmentStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
  }: {
    ticketRepo: Pick<TicketRepo, "loadById">;
    stepExecutionRepo: StepExecutionRepo;
  } = AppContext,
): Promise<QueueTicketDescriptionEnrichmentStepResponse> => {
  const input =
    queueTicketDescriptionEnrichmentStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const queuedAt = AppContext.timeProvider.now();
  const execution = new TicketDescriptionEnrichmentStepExecutionEntity(
    null,
    input.ticketId,
    "queued",
    null,
    queuedAt,
  );

  const savedExecution = await stepExecutionRepo.save(execution);

  return queueTicketDescriptionEnrichmentStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
