"use server";

import {
  triggerTicketDescriptionQualityStepRequestSchema,
  triggerTicketDescriptionQualityStepResponseSchema,
  type TriggerTicketDescriptionQualityStepRequest,
  type TriggerTicketDescriptionQualityStepResponse,
} from "@/modules/step-executions/contracts/trigger-ticket-description-quality-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  TERMINAL_STEP_EXECUTION_STATUSES,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { CodexCliTicketDescriptionQualityAi } from "@/modules/step-executions/infra/ticket-description-quality-ai";
import { AppContext } from "@/lib/di";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import {
  TicketDescriptionQualityStepExecutionEntity,
  TicketDescriptionQualityStepResultEntity,
  TicketPipelineStepExecutionEntity,
} from "../domain/step-execution-entity";
import { StepExecutionRepo } from "./step-execution-repo";

export const triggerTicketDescriptionQualityStep = async (
  rawInput: TriggerTicketDescriptionQualityStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
  }: {
    ticketRepo: TicketRepo;
    stepExecutionRepo: StepExecutionRepo;
  } = {
    ticketRepo: AppContext.ticketRepo,
    stepExecutionRepo: AppContext.stepExecutionRepo,
  },
): Promise<TriggerTicketDescriptionQualityStepResponse> => {
  const input =
    triggerTicketDescriptionQualityStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const now = new Date().toISOString();
  const execution = new TicketPipelineStepExecutionEntity(
    input.ticketId,
    input.pipelineRunId,
    TICKET_DESCRIPTION_QUALITY_STEP_NAME,
    "running",
    `${TICKET_DESCRIPTION_QUALITY_STEP_NAME}:${input.ticketId}`,
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
        savedExecution.pipelineRunId,
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
        new TicketPipelineStepExecutionEntity(
          savedExecution.ticketId,
          savedExecution.pipelineRunId,
          savedExecution.stepName,
          "failed",
          savedExecution.idempotencyKey,
          savedExecution.startedAt,
          new Date().toISOString(),
          savedExecution.id,
          savedExecution.createdAt,
          savedExecution.updatedAt,
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
