import { ticketDescriptionEnrichmentResultContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import {
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionEnrichmentStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  buildDiscriminatorResetFields,
  requiredNonEmptyString,
  type StepExecutionDefinition,
  type StepExecutionRow,
} from "@/modules/step-executions/domain/step-execution-definition";
import { TICKET_INVESTIGATION_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import { ticketDescriptionEnrichmentEvidenceFieldsSchema } from "@/modules/step-executions/ticket_description_enrichment/shared/ticket-description-enrichment-result";

function deserializeResult(row: StepExecutionRow) {
  const context = `${TICKET_INVESTIGATION_STEP_NAME} (execution ${row.id})`;
  if (!(row.summaryOfFindings && row.rawResultJson)) {
    return null;
  }

  const rawResultJson =
    row.rawResultJson && typeof row.rawResultJson === "object"
      ? (row.rawResultJson as Record<string, unknown>)
      : undefined;
  if (!rawResultJson) {
    return null;
  }

  const investigationReport = requiredNonEmptyString(
    typeof rawResultJson.investigationReport === "string"
      ? rawResultJson.investigationReport
      : typeof rawResultJson.enrichedTicketDescription === "string"
        ? rawResultJson.enrichedTicketDescription
        : null,
    "investigationReport",
    context,
  );

  const evidenceFields =
    ticketDescriptionEnrichmentEvidenceFieldsSchema.parse(rawResultJson);
  const datadogTimeRange =
    typeof rawResultJson.datadogTimeRange === "string"
      ? rawResultJson.datadogTimeRange
      : null;
  const operationOutcome =
    rawResultJson.operationOutcome === "findings_recorded" ||
    rawResultJson.operationOutcome === "inconclusive" ||
    rawResultJson.operationOutcome === "agent_error" ||
    rawResultJson.operationOutcome === "cancelled"
      ? rawResultJson.operationOutcome
      : "agent_error";
  const agentStatus =
    row.agentStatus === "complete" ||
    row.agentStatus === "error" ||
    row.agentStatus === "abort" ||
    row.agentStatus === "timeout" ||
    row.agentStatus === "user_exit"
      ? row.agentStatus
      : "error";

  return new TicketDescriptionEnrichmentStepResultEntity(
    requiredNonEmptyString(row.summaryOfFindings, "summaryOfFindings", context),
    investigationReport,
    evidenceFields.whatHappened,
    evidenceFields.datadogQueryTerms,
    datadogTimeRange,
    evidenceFields.keyIdentifiers,
    evidenceFields.exactEventTimes,
    evidenceFields.codeUnitsInvolved,
    evidenceFields.databaseFindings,
    evidenceFields.logFindings,
    evidenceFields.datadogSessionFindings,
    evidenceFields.investigationGaps,
    evidenceFields.recommendedNextQueries,
    row.confidenceLevel ?? null,
    rawResultJson,
    agentStatus,
    requiredNonEmptyString(row.agentBranch, "agentBranch", context),
    operationOutcome,
  );
}

export const ticketDescriptionEnrichmentStepDefinition: StepExecutionDefinition<TicketDescriptionEnrichmentStepExecutionEntity> =
  {
    stepName: TICKET_INVESTIGATION_STEP_NAME,
    isExecution: (
      execution,
    ): execution is TicketDescriptionEnrichmentStepExecutionEntity =>
      execution instanceof TicketDescriptionEnrichmentStepExecutionEntity,
    createQueuedExecution: ({ pipelineId, ticketId, now }) =>
      new TicketDescriptionEnrichmentStepExecutionEntity(
        pipelineId,
        ticketId,
        "queued",
        null,
        now ?? new Date().toISOString(),
      ),
    deserializeExecution: (row, ticketId = row.ticketId) =>
      new TicketDescriptionEnrichmentStepExecutionEntity(
        row.pipelineId,
        ticketId,
        row.status,
        deserializeResult(row),
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
        row.failureReason ?? undefined,
      ),
    serializeExecution: ({ execution, endedAt, now }) => {
      let fields = buildDiscriminatorResetFields();

      if (execution.status === "succeeded") {
        if (!execution.result) {
          throw new Error(
            "Missing required description enrichment result payload for succeeded execution",
          );
        }

        fields = {
          ...fields,
          agentStatus: execution.result.agentStatus,
          agentBranch: execution.result.agentBranch,
          summaryOfFindings: execution.result.summaryOfInvestigation,
          confidenceLevel: execution.result.confidenceLevel,
          rawResultJson: {
            ...execution.result.rawResultJson,
            summaryOfInvestigation: execution.result.summaryOfInvestigation,
            whatHappened: execution.result.whatHappened,
            datadogQueryTerms: execution.result.datadogQueryTerms,
            datadogTimeRange: execution.result.datadogTimeRange,
            keyIdentifiers: execution.result.keyIdentifiers,
            exactEventTimes: execution.result.exactEventTimes,
            codeUnitsInvolved: execution.result.codeUnitsInvolved,
            databaseFindings: execution.result.databaseFindings,
            logFindings: execution.result.logFindings,
            datadogSessionFindings: execution.result.datadogSessionFindings,
            investigationGaps: execution.result.investigationGaps,
            recommendedNextQueries: execution.result.recommendedNextQueries,
            investigationReport: execution.result.investigationReport,
            operationOutcome: execution.result.operationOutcome,
          },
          completedAt: endedAt,
          lastPolledAt: now,
        };
      }

      return fields;
    },
    mapResultToContract: (execution) => {
      if (!execution.result) {
        return null;
      }

      return ticketDescriptionEnrichmentResultContractSchema.parse({
        executionId: execution.id,
        stepName: execution.stepName,
        summaryOfInvestigation: execution.result.summaryOfInvestigation,
        investigationReport: execution.result.investigationReport,
        whatHappened: execution.result.whatHappened,
        datadogQueryTerms: execution.result.datadogQueryTerms,
        datadogTimeRange: execution.result.datadogTimeRange,
        keyIdentifiers: execution.result.keyIdentifiers,
        exactEventTimes: execution.result.exactEventTimes,
        codeUnitsInvolved: execution.result.codeUnitsInvolved,
        databaseFindings: execution.result.databaseFindings,
        logFindings: execution.result.logFindings,
        datadogSessionFindings: execution.result.datadogSessionFindings,
        investigationGaps: execution.result.investigationGaps,
        recommendedNextQueries: execution.result.recommendedNextQueries,
        confidenceLevel: execution.result.confidenceLevel,
        agentStatus: execution.result.agentStatus,
        agentBranch: execution.result.agentBranch,
        operationOutcome: execution.result.operationOutcome,
        rawResultJson: execution.result.rawResultJson,
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
      });
    },
    shouldAdvance: (execution) => execution.status === "succeeded",
  };
