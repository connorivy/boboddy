import { finalizeFailingTestReproPrStepResultContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import {
  FinalizeFailingTestReproPrStepExecutionEntity,
  FinalizeFailingTestReproPrStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  buildDiscriminatorResetFields,
  requiredNonEmptyString,
  requiredTruthyField,
  type StepExecutionDefinition,
  type StepExecutionRow,
} from "@/modules/step-executions/domain/step-execution-definition";
import { FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";

function deserializeResult(row: StepExecutionRow) {
  const context = `${FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME} (execution ${row.id})`;
  if (!row.agentBranch) {
    return null;
  }

  return new FinalizeFailingTestReproPrStepResultEntity(
    requiredTruthyField(row.githubMergeStatus, "githubMergeStatus", context),
    requiredTruthyField(row.githubIssueNumber, "githubIssueNumber", context),
    requiredNonEmptyString(row.githubIssueId, "githubIssueId", context),
    requiredNonEmptyString(
      row.githubPrTargetBranch,
      "githubPrTargetBranch",
      context,
    ),
    requiredNonEmptyString(row.agentBranch, "agentBranch", context),
  );
}

export const finalizeFailingTestReproPrStepDefinition: StepExecutionDefinition<FinalizeFailingTestReproPrStepExecutionEntity> =
  {
    stepName: FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME,
    isExecution: (
      execution,
    ): execution is FinalizeFailingTestReproPrStepExecutionEntity =>
      execution instanceof FinalizeFailingTestReproPrStepExecutionEntity,
    createQueuedExecution: ({ pipelineId, ticketId, now }) =>
      new FinalizeFailingTestReproPrStepExecutionEntity(
        pipelineId,
        ticketId,
        "queued",
        null,
        now ?? new Date().toISOString(),
      ),
    deserializeExecution: (row, ticketId = row.ticketId) =>
      new FinalizeFailingTestReproPrStepExecutionEntity(
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
    serializeExecution: ({ execution, endedAt, now }) => ({
      ...buildDiscriminatorResetFields(),
      githubIssueNumber: execution.result?.githubIssueNumber ?? null,
      githubIssueId: execution.result?.githubIssueId ?? null,
      githubMergeStatus: execution.result?.githubMergeStatus ?? "draft",
      githubPrTargetBranch: execution.result?.githubPrTargetBranch ?? null,
      agentBranch: execution.result?.agentBranch ?? null,
      completedAt: endedAt,
      lastPolledAt: now,
    }),
    mapResultToContract: (execution) => {
      if (!execution.result) {
        return null;
      }

      return finalizeFailingTestReproPrStepResultContractSchema.parse({
        executionId: execution.id,
        stepName: execution.stepName,
        githubIssueNumber: execution.result.githubIssueNumber,
        githubIssueId: execution.result.githubIssueId,
        githubMergeStatus: execution.result.githubMergeStatus,
        githubPrTargetBranch: execution.result.githubPrTargetBranch,
        agentBranch: execution.result.agentBranch,
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
      });
    },
    shouldAdvance: (execution) =>
      execution.status === "succeeded" &&
      execution.result?.githubMergeStatus === "merged",
  };
