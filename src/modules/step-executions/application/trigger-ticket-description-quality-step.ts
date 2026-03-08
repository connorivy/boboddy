"use server";

import {
  triggerTicketDescriptionQualityStepRequestSchema,
  triggerTicketDescriptionQualityStepResponseSchema,
  type TriggerTicketDescriptionQualityStepRequest,
  type TriggerTicketDescriptionQualityStepResponse,
} from "@/modules/step-executions/contracts/trigger-ticket-description-quality-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import type { PipelineRunRepo } from "@/modules/pipeline-runs/application/pipeline-run-repo";
import { PipelineRunAggregate } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import {
  TERMINAL_STEP_EXECUTION_STATUSES,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { CodexCliTicketDescriptionQualityAi } from "@/modules/step-executions/infra/ticket-description-quality-ai";
import { AppContext } from "@/lib/di";
import {
  TicketDescriptionQualityStepExecutionEntity,
  TicketDescriptionQualityStepResultEntity,
  TicketPipelineStepExecutionEntity,
} from "../domain/step-execution-entity";

export const triggerTicketDescriptionQualityStep = async (
  rawInput: TriggerTicketDescriptionQualityStepRequest,
  {
    ticketRepo,
    stepExecutionRepo,
    pipelineRunRepo = AppContext.pipelineRunRepo,
  }: {
    ticketRepo: typeof AppContext.ticketRepo;
    stepExecutionRepo: typeof AppContext.stepExecutionRepo;
    pipelineRunRepo?: PipelineRunRepo;
  } = AppContext,
): Promise<TriggerTicketDescriptionQualityStepResponse> => {
  const input =
    triggerTicketDescriptionQualityStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const now = new Date().toISOString();
  const pipelineRun = await pipelineRunRepo.save(
    PipelineRunAggregate.create({
      ticketId: input.ticketId,
      pipelineName: TICKET_DESCRIPTION_QUALITY_STEP_NAME,
      status: "running",
    }),
  );
  if (pipelineRun.id === undefined) {
    throw new Error("Pipeline run ID missing after persistence");
  }
  const execution = new TicketPipelineStepExecutionEntity(
    input.ticketId,
    TICKET_DESCRIPTION_QUALITY_STEP_NAME,
    "running",
    `${TICKET_DESCRIPTION_QUALITY_STEP_NAME}:${input.ticketId}`,
    now,
    undefined,
    undefined,
    undefined,
    undefined,
    pipelineRun.id,
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
        savedExecution.pipelineRunId,
      ),
    );
  } catch (error) {
    if (!TERMINAL_STEP_EXECUTION_STATUSES.has(savedExecution.status)) {
      await stepExecutionRepo.save(
        new TicketPipelineStepExecutionEntity(
          savedExecution.ticketId,
          savedExecution.stepName,
          "failed",
          savedExecution.idempotencyKey,
          savedExecution.startedAt,
          new Date().toISOString(),
          savedExecution.id,
          savedExecution.createdAt,
          savedExecution.updatedAt,
          savedExecution.pipelineRunId,
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
