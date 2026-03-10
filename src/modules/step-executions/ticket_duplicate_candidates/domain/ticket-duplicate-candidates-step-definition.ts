import { ticketDuplicateCandidatesStepResultContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import {
  TicketDuplicateCandidatesResultEntity,
  TicketDuplicateCandidatesStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  buildDiscriminatorResetFields,
  parseDuplicateCandidatesList,
  type StepExecutionDefinition,
  type StepExecutionRow,
} from "@/modules/step-executions/domain/step-execution-definition";
import { TICKET_DUPLICATE_CANDIDATES_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";

const DUPLICATE_CONFIDENCE_BLOCK_THRESHOLD = 0.85;

function deserializeResult(row: StepExecutionRow) {
  const hasResult =
    row.duplicateCandidatesProposed !== null ||
    row.duplicateCandidatesDismissed !== null ||
    row.duplicateCandidatesPromoted !== null;
  if (!hasResult) {
    return null;
  }

  const context = `${TICKET_DUPLICATE_CANDIDATES_STEP_NAME} (execution ${row.id})`;
  return new TicketDuplicateCandidatesResultEntity(
    parseDuplicateCandidatesList(
      row.duplicateCandidatesProposed,
      "duplicateCandidatesProposed",
      context,
    ),
    parseDuplicateCandidatesList(
      row.duplicateCandidatesDismissed,
      "duplicateCandidatesDismissed",
      context,
    ),
    parseDuplicateCandidatesList(
      row.duplicateCandidatesPromoted,
      "duplicateCandidatesPromoted",
      context,
    ),
  );
}

export const ticketDuplicateCandidatesStepDefinition: StepExecutionDefinition<TicketDuplicateCandidatesStepResultEntity> =
  {
    stepName: TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
    isExecution: (
      execution,
    ): execution is TicketDuplicateCandidatesStepResultEntity =>
      execution instanceof TicketDuplicateCandidatesStepResultEntity,
    createQueuedExecution: ({ pipelineId, ticketId, now }) =>
      new TicketDuplicateCandidatesStepResultEntity(
        pipelineId,
        ticketId,
        "queued",
        null,
        now ?? new Date().toISOString(),
      ),
    deserializeExecution: (row, ticketId = row.ticketId) =>
      new TicketDuplicateCandidatesStepResultEntity(
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
    serializeExecution: ({ execution }) => {
      let fields = buildDiscriminatorResetFields();

      if (execution.status === "succeeded") {
        if (!execution.result) {
          throw new Error(
            "Missing required duplicate candidates result payload for succeeded execution",
          );
        }

        fields = {
          ...fields,
          duplicateCandidatesProposed: JSON.stringify(execution.result.proposed),
          duplicateCandidatesDismissed: JSON.stringify(
            execution.result.dismissed,
          ),
          duplicateCandidatesPromoted: JSON.stringify(execution.result.promoted),
        };
      }

      return fields;
    },
    mapResultToContract: (execution) => {
      if (!execution.result) {
        return null;
      }

      return ticketDuplicateCandidatesStepResultContractSchema.parse({
        executionId: execution.id,
        stepName: execution.stepName,
        proposed: execution.result.proposed.map((candidate) => ({
          candidateTicketId: candidate.candidateTicketId,
          score: candidate.score,
        })),
        dismissed: execution.result.dismissed.map((candidate) => ({
          candidateTicketId: candidate.candidateTicketId,
          score: candidate.score,
        })),
        promoted: execution.result.promoted.map((candidate) => ({
          candidateTicketId: candidate.candidateTicketId,
          score: candidate.score,
        })),
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
      });
    },
    shouldAdvance: (execution) => {
      if (execution.status !== "succeeded" || !execution.result) {
        return false;
      }

      const topDuplicateScore = Math.max(
        0,
        ...execution.result.proposed.map((candidate) => candidate.score),
        ...execution.result.promoted.map((candidate) => candidate.score),
      );

      return topDuplicateScore < DUPLICATE_CONFIDENCE_BLOCK_THRESHOLD;
    },
  };
