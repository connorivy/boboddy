"use server";

import {
  triggerTicketDescriptionQualityStepRequestSchema,
  triggerTicketDescriptionQualityStepResponseSchema,
  type TriggerTicketDescriptionQualityStepRequest,
  type TriggerTicketDescriptionQualityStepResponse,
} from "@/modules/step-executions/ticket_description_quality_rank/contracts/trigger-ticket-description-quality-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  TERMINAL_STEP_EXECUTION_STATUSES,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { CodexCliTicketDescriptionQualityAi } from "@/modules/step-executions/ticket_description_quality_rank/infra/ticket-description-quality-ai";
import { AppContext } from "@/lib/di";
import {
  TicketDescriptionQualityStepExecutionEntity,
  TicketDescriptionQualityStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";

export const triggerTicketDescriptionQualityStep = async (
  rawInput: TriggerTicketDescriptionQualityStepRequest,
  { ticketRepo, stepExecutionRepo } = AppContext,
): Promise<TriggerTicketDescriptionQualityStepResponse> => {
  const input =
    triggerTicketDescriptionQualityStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const now = new Date().toISOString();
  const execution = new TicketDescriptionQualityStepExecutionEntity(
    input.ticketId,
    "running",
    `${TICKET_DESCRIPTION_QUALITY_STEP_NAME}:${input.ticketId}`,
    null,
    now,
  );

  let savedExecution = await stepExecutionRepo.save(execution);

  try {
    const aiResult =
      await new CodexCliTicketDescriptionQualityAi().rankTicketDescription({
        title: ticket.title,
        description: ticket.description,
      });

    if (savedExecution.id === undefined) {
      throw new Error("Step execution ID missing after persistence");
    }

    savedExecution = await stepExecutionRepo.save(
      new TicketDescriptionQualityStepExecutionEntity(
        savedExecution.ticketId,
        "succeeded",
        savedExecution.idempotencyKey,
        new TicketDescriptionQualityStepResultEntity(
          aiResult.stepsToReproduceScore,
          aiResult.expectedBehaviorScore,
          aiResult.observedBehaviorScore,
          aiResult.reasoning,
          aiResult.rawResponse,
        ),
        savedExecution.startedAt,
        new Date().toISOString(),
        savedExecution.createdAt,
        savedExecution.updatedAt,
        savedExecution.id,
      ),
    );
  } catch (error) {
    if (!TERMINAL_STEP_EXECUTION_STATUSES.has(savedExecution.status)) {
      await stepExecutionRepo.save(
        new TicketDescriptionQualityStepExecutionEntity(
          savedExecution.ticketId,
          "failed",
          savedExecution.idempotencyKey,
          null,
          savedExecution.startedAt,
          new Date().toISOString(),
          savedExecution.createdAt,
          savedExecution.updatedAt,
          savedExecution.id,
        ),
      );
    }
    throw error;
  }

  return triggerTicketDescriptionQualityStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
