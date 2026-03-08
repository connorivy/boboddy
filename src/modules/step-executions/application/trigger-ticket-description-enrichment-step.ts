"use server";

import { randomUUID } from "node:crypto";
import {
  triggerTicketDescriptionEnrichmentStepRequestSchema,
  triggerTicketDescriptionEnrichmentStepResponseSchema,
  type TriggerTicketDescriptionEnrichmentStepRequest,
  type TriggerTicketDescriptionEnrichmentStepResponse,
} from "@/modules/step-executions/contracts/trigger-ticket-description-enrichment-step-contracts";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  TERMINAL_STEP_EXECUTION_STATUSES,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { CodexCliTicketDescriptionEnrichmentAi } from "@/modules/step-executions/infra/ticket-description-enrichment-ai";
import { AppContext } from "@/lib/di";
import {
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionEnrichmentStepResultEntity,
  TicketPipelineStepExecutionEntity,
} from "../domain/step-execution-entity";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { StepExecutionRepo } from "./step-execution-repo";

const getPostgresMcpConnectionString = (): string => {
  if (!process.env.POSTGRES_MCP_CONNECTION_STRING) {
    throw new Error("POSTGRES_MCP_CONNECTION_STRING is not set");
  }

  return process.env.POSTGRES_MCP_CONNECTION_STRING;
};

export const triggerTicketDescriptionEnrichmentStep = async (
  rawInput: TriggerTicketDescriptionEnrichmentStepRequest,
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
): Promise<TriggerTicketDescriptionEnrichmentStepResponse> => {
  const input =
    triggerTicketDescriptionEnrichmentStepRequestSchema.parse(rawInput);

  const ticket = await ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const now = new Date().toISOString();
  const execution = new TicketPipelineStepExecutionEntity(
    input.ticketId,
    input.pipelineRunId,
    TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
    "running",
    `${TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME}:${input.ticketId}:${randomUUID()}`,
    now,
  );

  let savedExecution = await stepExecutionRepo.save(execution);

  try {
    const aiResult =
      await new CodexCliTicketDescriptionEnrichmentAi().enrichTicketDescription(
        {
          ticketId: input.ticketId,
          ticketNumber: ticket.ticketNumber,
          title: ticket.title,
          description: ticket.description,
          companyNames: ticket.companyNames,
          employeeEmails: ticket.employeeEmails,
          postgresMcpConnectionString: getPostgresMcpConnectionString(),
        },
      );

    savedExecution = await stepExecutionRepo.save(
      new TicketDescriptionEnrichmentStepExecutionEntity(
        savedExecution.ticketId,
        savedExecution.pipelineRunId,
        "succeeded",
        savedExecution.idempotencyKey,
        new TicketDescriptionEnrichmentStepResultEntity(
          aiResult.summaryOfEnrichment,
          aiResult.enrichedTicketDescription,
          aiResult.datadogQueryTerms,
          aiResult.datadogTimeRange,
          aiResult.keyIdentifiers,
          aiResult.confidenceLevel,
          {
            ...aiResult.rawResultJson,
            rawResponse: aiResult.rawResponse,
          },
          "complete",
          "local-codex",
          aiResult.operationOutcome,
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

  return triggerTicketDescriptionEnrichmentStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
