import { failingTestFixStepResultContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import {
  FailingTestFixStepCompletionResultEntity,
  FailingTestFixStepExecutionEntity,
  FailingTestFixStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  buildDiscriminatorResetFields,
  parseFixOperationOutcome,
  requiredField,
  requiredNonEmptyString,
  requiredTruthyField,
  type StepExecutionDefinition,
  type StepExecutionRow,
} from "@/modules/step-executions/domain/step-execution-definition";
import { FAILING_TEST_FIX_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";

function deserializeResult(row: StepExecutionRow) {
  const context = `${FAILING_TEST_FIX_STEP_NAME} (execution ${row.id})`;
  if (!row.githubPrTargetBranch) {
    return null;
  }

  let completionResult: FailingTestFixStepCompletionResultEntity | null = null;
  if (row.summaryOfFix) {
    completionResult = new FailingTestFixStepCompletionResultEntity(
      requiredTruthyField(row.agentStatus, "agentStatus", context),
      requiredNonEmptyString(row.agentBranch, "agentBranch", context),
      requiredField(
        parseFixOperationOutcome(row.fixOperationOutcome),
        "fixOperationOutcome",
        context,
      ),
      requiredNonEmptyString(row.summaryOfFix, "summaryOfFix", context),
      requiredTruthyField(
        row.fixConfidenceLevel,
        "fixConfidenceLevel",
        context,
      ),
      row.fixedTestPath ?? row.failingTestPath ?? undefined,
      row.failureReason ?? undefined,
      row.rawResultJson && typeof row.rawResultJson === "object"
        ? (row.rawResultJson as Record<string, unknown>)
        : undefined,
    );
  }

  return new FailingTestFixStepResultEntity(
    requiredTruthyField(row.githubMergeStatus, "githubMergeStatus", context),
    requiredTruthyField(row.githubIssueNumber, "githubIssueNumber", context),
    requiredNonEmptyString(row.githubIssueId, "githubIssueId", context),
    requiredNonEmptyString(
      row.githubPrTargetBranch,
      "githubPrTargetBranch",
      context,
    ),
    completionResult,
    row.githubAgentRunId ?? undefined,
    row.agentSummary ?? undefined,
    row.failingTestPath ?? undefined,
    row.failingTestCommitSha ?? undefined,
  );
}

export const failingTestFixStepDefinition: StepExecutionDefinition<FailingTestFixStepExecutionEntity> =
  {
    stepName: FAILING_TEST_FIX_STEP_NAME,
    isExecution: (
      execution,
    ): execution is FailingTestFixStepExecutionEntity =>
      execution instanceof FailingTestFixStepExecutionEntity,
    createQueuedExecution: ({ pipelineId, ticketId, now }) =>
      new FailingTestFixStepExecutionEntity(
        pipelineId,
        ticketId,
        "queued",
        null,
        now ?? new Date().toISOString(),
      ),
    deserializeExecution: (row, ticketId = row.ticketId) =>
      new FailingTestFixStepExecutionEntity(
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
      const fixResult = execution.result;
      const completionResult = fixResult?.completionResult;

      return {
        ...buildDiscriminatorResetFields(),
        githubIssueNumber: fixResult?.githubIssueNumber ?? null,
        githubIssueId: fixResult?.githubIssueId ?? null,
        githubAgentRunId: fixResult?.githubAgentRunId ?? null,
        agentStatus: completionResult?.agentStatus ?? null,
        githubMergeStatus: fixResult?.githubMergeStatus ?? "draft",
        githubPrTargetBranch: fixResult?.githubPrTargetBranch ?? null,
        agentBranch: completionResult?.agentBranch ?? null,
        agentSummary: fixResult?.agentSummary ?? null,
        failingTestCommitSha: fixResult?.failingTestCommitSha ?? null,
        failureReason: completionResult?.failureReason ?? null,
        rawResultJson: completionResult?.rawResultJson ?? null,
        completedAt: endedAt,
        lastPolledAt: now,
        fixOperationOutcome: completionResult?.fixOperationOutcome ?? null,
        fixedTestPath:
          completionResult?.fixedTestPath ?? fixResult?.failingTestPath ?? null,
        summaryOfFix: completionResult?.summaryOfFix ?? null,
        fixConfidenceLevel: completionResult?.fixConfidenceLevel ?? null,
      };
    },
    mapResultToContract: (execution) => {
      if (!execution.result) {
        return null;
      }

      const completionResult = execution.result.completionResult;
      return failingTestFixStepResultContractSchema.parse({
        executionId: execution.id,
        stepName: execution.stepName,
        githubIssueNumber: execution.result.githubIssueNumber,
        githubIssueId: execution.result.githubIssueId,
        githubAgentRunId: execution.result.githubAgentRunId ?? null,
        githubMergeStatus: execution.result.githubMergeStatus,
        githubPrTargetBranch: execution.result.githubPrTargetBranch,
        agentStatus: completionResult?.agentStatus ?? null,
        agentBranch: completionResult?.agentBranch ?? null,
        agentSummary: execution.result.agentSummary ?? null,
        fixedTestPath:
          completionResult?.fixedTestPath ??
          execution.result.failingTestPath ??
          null,
        failingTestCommitSha: execution.result.failingTestCommitSha,
        fixOperationOutcome: completionResult?.fixOperationOutcome ?? null,
        summaryOfFix: completionResult?.summaryOfFix ?? null,
        fixConfidenceLevel: completionResult?.fixConfidenceLevel ?? null,
        failureReason: completionResult?.failureReason ?? null,
        rawResultJson: completionResult?.rawResultJson ?? null,
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
      });
    },
    shouldAdvance: (execution) => execution.status === "succeeded",
  };
