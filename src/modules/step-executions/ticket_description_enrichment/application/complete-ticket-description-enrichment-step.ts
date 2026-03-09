import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  completeTicketDescriptionEnrichmentStepRequestSchema,
  completeTicketDescriptionEnrichmentStepResponseSchema,
  type CompleteTicketDescriptionEnrichmentStepRequest,
  type CompleteTicketDescriptionEnrichmentStepResponse,
} from "@/modules/step-executions/ticket_description_enrichment/contracts/complete-ticket-description-enrichment-step-contracts";
import { TICKET_INVESTIGATION_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import type { StepExecutionStatus } from "@/modules/tickets/contracts/ticket-contracts";
import { httpError } from "@/lib/api/http";
import { AppContext } from "@/lib/di";
import {
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionEnrichmentStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

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
    input.operationOutcome === "findings_recorded" ||
    input.operationOutcome === "inconclusive"
  ) {
    return "succeeded";
  }

  return "failed";
};

export const completeTicketDescriptionEnrichmentStep = async (
  rawInput: CompleteTicketDescriptionEnrichmentStepRequest,
  { stepExecutionRepo }: { stepExecutionRepo: StepExecutionRepo } = AppContext,
): Promise<CompleteTicketDescriptionEnrichmentStepResponse> => {
  const input =
    completeTicketDescriptionEnrichmentStepRequestSchema.parse(rawInput);

  const existingExecution = await stepExecutionRepo.load(input.stepExecutionId);
  if (!existingExecution) {
    throw httpError("Pipeline step execution not found", 404);
  }

  if (existingExecution.stepName !== TICKET_INVESTIGATION_STEP_NAME) {
    throw httpError(
      "Pipeline step execution is not a ticket-description enrichment step",
      409,
    );
  }

  if (
    !(
      existingExecution instanceof
      TicketDescriptionEnrichmentStepExecutionEntity
    )
  ) {
    throw httpError(
      "Pipeline step execution payload is not a ticket-description enrichment result",
      409,
    );
  }

  const endedAt = new Date().toISOString();
  existingExecution.setResult({
    status: resolveStatus(input),
    endedAt,
    result: new TicketDescriptionEnrichmentStepResultEntity(
      input.summaryOfInvestigation,
      input.investigationReport,
      input.whatHappened,
      input.datadogQueryTerms,
      input.datadogTimeRange,
      input.keyIdentifiers,
      input.exactEventTimes,
      input.codeUnitsInvolved,
      input.databaseFindings,
      input.logFindings,
      input.datadogSessionFindings,
      input.investigationGaps,
      input.recommendedNextQueries,
      input.confidenceLevel,
      input.rawResultJson,
      input.agentStatus,
      input.agentBranch,
      input.operationOutcome,
    ),
  });
  const savedExecution = await stepExecutionRepo.save(existingExecution);

  return completeTicketDescriptionEnrichmentStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
