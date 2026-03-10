"use server";

import {
  queueTicketFailingTestReproStepRequestSchema,
  queueTicketFailingTestReproStepResponseSchema,
  type QueueTicketFailingTestReproStepRequest,
  type QueueTicketFailingTestReproStepResponse,
} from "@/modules/step-executions/github_repro_failing_test/contracts/queue-ticket-failing-test-repro-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import { AppContext } from "@/lib/di";
import type { TimeProvider } from "@/lib/time-provider";
import { FailingTestReproStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import type { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

export const queueTicketFailingTestReproStep = async (
  rawInput: QueueTicketFailingTestReproStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
    timeProvider,
  }: {
    ticketRepo: Pick<TicketRepo, "loadById">;
    stepExecutionRepo: StepExecutionRepo;
    timeProvider: TimeProvider;
  } = AppContext,
): Promise<QueueTicketFailingTestReproStepResponse> => {
  const input = queueTicketFailingTestReproStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const queuedAt = timeProvider.now();
  const execution = new FailingTestReproStepExecutionEntity(
    null,
    input.ticketId,
    "queued",
    null,
    null,
    queuedAt,
  );

  const savedExecution = await stepExecutionRepo.save(execution);

  return queueTicketFailingTestReproStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
