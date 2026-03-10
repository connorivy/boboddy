import { ticketDescriptionQualityResultContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import {
  TicketDescriptionQualityStepExecutionEntity,
  TicketDescriptionQualityStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  buildDiscriminatorResetFields,
  requiredField,
  requiredNonEmptyString,
  type StepExecutionDefinition,
  type StepExecutionRow,
} from "@/modules/step-executions/domain/step-execution-definition";
import { TICKET_DESCRIPTION_QUALITY_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";

const DESCRIPTION_QUALITY_ADVANCEMENT_THRESHOLD = 0.6;

function deserializeResult(row: StepExecutionRow) {
  const context = `${TICKET_DESCRIPTION_QUALITY_STEP_NAME} (execution ${row.id})`;
  if (row.stepsToReproduceScore === null) {
    return null;
  }

  return new TicketDescriptionQualityStepResultEntity(
    requiredField(row.stepsToReproduceScore, "stepsToReproduceScore", context),
    requiredField(row.expectedBehaviorScore, "expectedBehaviorScore", context),
    requiredField(row.observedBehaviorScore, "observedBehaviorScore", context),
    requiredNonEmptyString(row.reasoning, "reasoning", context),
    requiredNonEmptyString(row.rawResponse, "rawResponse", context),
  );
}

export const ticketDescriptionQualityStepDefinition: StepExecutionDefinition<TicketDescriptionQualityStepExecutionEntity> =
  {
    stepName: TICKET_DESCRIPTION_QUALITY_STEP_NAME,
    isExecution: (
      execution,
    ): execution is TicketDescriptionQualityStepExecutionEntity =>
      execution instanceof TicketDescriptionQualityStepExecutionEntity,
    createQueuedExecution: ({ pipelineId, ticketId, now }) =>
      new TicketDescriptionQualityStepExecutionEntity(
        pipelineId,
        ticketId,
        "queued",
        null,
        now ?? new Date(),
      ),
    deserializeExecution: (row, ticketId = row.ticketId) =>
      new TicketDescriptionQualityStepExecutionEntity(
        row.pipelineId,
        ticketId,
        row.status,
        deserializeResult(row),
        row.startedAt,
        row.endedAt ?? undefined,
        row.createdAt,
        row.updatedAt,
        row.id,
        row.failureReason ?? undefined,
      ),
    serializeExecution: ({ execution }) => {
      let fields = buildDiscriminatorResetFields();

      if (execution.status === "succeeded") {
        if (!execution.result) {
          throw new Error(
            "Missing required description quality result payload for succeeded execution",
          );
        }

        fields = {
          ...fields,
          stepsToReproduceScore: requiredField(
            execution.result.stepsToReproduceScore,
            "stepsToReproduceScore",
            execution.stepName,
          ),
          expectedBehaviorScore: requiredField(
            execution.result.expectedBehaviorScore,
            "expectedBehaviorScore",
            execution.stepName,
          ),
          observedBehaviorScore: requiredField(
            execution.result.observedBehaviorScore,
            "observedBehaviorScore",
            execution.stepName,
          ),
          reasoning: requiredField(
            execution.result.reasoning,
            "reasoning",
            execution.stepName,
          ),
          rawResponse: requiredField(
            execution.result.rawResponse,
            "rawResponse",
            execution.stepName,
          ),
        };
      }

      return fields;
    },
    mapResultToContract: (execution) => {
      if (!execution.result) {
        return null;
      }

      return ticketDescriptionQualityResultContractSchema.parse({
        executionId: execution.id,
        stepName: execution.stepName,
        stepsToReproduceScore: execution.result.stepsToReproduceScore,
        expectedBehaviorScore: execution.result.expectedBehaviorScore,
        observedBehaviorScore: execution.result.observedBehaviorScore,
        reasoning: execution.result.reasoning,
        rawResponse: execution.result.rawResponse,
        createdAt: execution.createdAt?.toISOString(),
        updatedAt: execution.updatedAt?.toISOString(),
      });
    },
    shouldAdvance: (execution) => {
      if (execution.status !== "succeeded" || !execution.result) {
        return false;
      }

      const averageQualityScore =
        (execution.result.stepsToReproduceScore +
          execution.result.expectedBehaviorScore +
          execution.result.observedBehaviorScore) /
        3;

      return averageQualityScore >= DESCRIPTION_QUALITY_ADVANCEMENT_THRESHOLD;
    },
  };
