"use server";

import {
  queueTicketFailingTestFixStepRequestSchema,
  queueTicketFailingTestFixStepResponseSchema,
  type QueueTicketFailingTestFixStepRequest,
  type QueueTicketFailingTestFixStepResponse,
} from "@/modules/step-executions/github_fix_failing_test/contracts/queue-ticket-failing-test-fix-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import { AppContext } from "@/lib/di";
import { FailingTestFixStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import type { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

export const queueTicketFailingTestFixStep = async (
  rawInput: QueueTicketFailingTestFixStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
  }: {
    ticketRepo: Pick<TicketRepo, "loadById">;
    stepExecutionRepo: StepExecutionRepo;
  } = AppContext,
): Promise<QueueTicketFailingTestFixStepResponse> => {
  const input = queueTicketFailingTestFixStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const queuedAt = AppContext.timeProvider.now();
  const execution = new FailingTestFixStepExecutionEntity(
    null,
    input.ticketId,
    "queued",
    null,
    queuedAt,
  );

  const savedExecution = await stepExecutionRepo.save(execution);

  return queueTicketFailingTestFixStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
