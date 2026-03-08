"use server";

import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  completeTicketDescriptionEnrichmentStepRequestSchema,
  completeTicketDescriptionEnrichmentStepResponseSchema,
  type CompleteTicketDescriptionEnrichmentStepRequest,
  type CompleteTicketDescriptionEnrichmentStepResponse,
} from "@/modules/step-executions/contracts/complete-ticket-description-enrichment-step-contracts";
import { TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import type { StepExecutionStatus } from "@/modules/tickets/contracts/ticket-contracts";
import { httpError } from "@/lib/api/http";
import { AppContext } from "@/lib/di";
import {
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionEnrichmentStepResultEntity,
} from "../domain/step-execution-entity";
import { StepExecutionRepo } from "./step-execution-repo";

const resolveStatus = (
  input: CompleteTicketDescriptionEnrichmentStepRequest,
): StepExecutionStatus => {
  if (input.agentStatus === "complete") {
    return "succeeded";
  }

  if (input.agentStatus === "timeout") {
    return "failed_timeout";
  }

  if (input.agentStatus !== null) {
    return "failed";
  }

  if (
    input.operationOutcome === "enriched" ||
    input.operationOutcome === "insufficient_evidence"
  ) {
    return "succeeded";
  }

  return "failed";
};

export const completeTicketDescriptionEnrichmentStep = async (
  rawInput: CompleteTicketDescriptionEnrichmentStepRequest,
  { stepExecutionRepo }: { stepExecutionRepo: StepExecutionRepo } = AppContext,
): Promise<CompleteTicketDescriptionEnrichmentStepResponse> => {
  const input = completeTicketDescriptionEnrichmentStepRequestSchema.parse(rawInput);

  const existingExecution = await stepExecutionRepo.load(input.pipelineId);
  if (!existingExecution || existingExecution.ticketId !== input.ticketId) {
    throw httpError("Pipeline step execution not found", 404);
  }

  if (existingExecution.stepName !== TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME) {
    throw httpError(
      "Pipeline step execution is not a ticket-description enrichment step",
      409,
    );
  }

  if (!(existingExecution instanceof TicketDescriptionEnrichmentStepExecutionEntity)) {
    throw httpError(
      "Pipeline step execution payload is not a ticket-description enrichment result",
      409,
    );
  }

  const endedAt = new Date().toISOString();

  const savedExecution = await stepExecutionRepo.save(
    new TicketDescriptionEnrichmentStepExecutionEntity(
      existingExecution.ticketId,
      resolveStatus(input),
      existingExecution.idempotencyKey,
      new TicketDescriptionEnrichmentStepResultEntity(
        input.summaryOfEnrichment,
        input.enrichedTicketDescription,
        input.datadogQueryTerms,
        input.datadogTimeRange,
        input.keyIdentifiers,
        input.confidenceLevel,
        {
          ...input.rawResultJson,
          datadogQueryTerms: input.datadogQueryTerms,
          datadogTimeRange: input.datadogTimeRange,
          keyIdentifiers: input.keyIdentifiers,
          enrichedTicketDescription: input.enrichedTicketDescription,
          operationOutcome: input.operationOutcome,
        },
        input.agentStatus,
        input.agentBranch,
        input.operationOutcome,
      ),
      existingExecution.startedAt,
      endedAt,
      existingExecution.createdAt,
      existingExecution.updatedAt,
      existingExecution.id,
      existingExecution.pipelineRunId,
    ),
  );

  return completeTicketDescriptionEnrichmentStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
