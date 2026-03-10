import { failingTestReproStepResultContractSchema } from "@/modules/step-executions/contracts/step-execution-contracts";
import {
  FailingTestReproAgentErrorResultEntity,
  FailingTestReproCancelledResultEntity,
  FailingTestReproNeedsUserFeedbackResultEntity,
  FailingTestReproNotReproducibleResultEntity,
  FailingTestReproStepExecutionEntity,
  type FailingTestReproStepResultEntity,
  FailingTestReproSucceededResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  parseFailingTestPaths,
  parseFeedbackRequest,
  requiredNonEmptyString,
  requiredTruthyField,
  serializeFailingTestPaths,
  buildDiscriminatorResetFields,
  type StepExecutionDefinition,
  type StepExecutionRow,
} from "@/modules/step-executions/domain/step-execution-definition";
import { FAILING_TEST_REPRO_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";

const REPRO_CONFIDENCE_ADVANCEMENT_THRESHOLD = 0.85;

function deserializeResult(
  row: StepExecutionRow,
): FailingTestReproStepResultEntity | null {
  const context = `${FAILING_TEST_REPRO_STEP_NAME} (execution ${row.id})`;
  if (!row.agentBranch) {
    return null;
  }

  const rawResultJson =
    row.rawResultJson && typeof row.rawResultJson === "object"
      ? (row.rawResultJson as Record<string, unknown>)
      : undefined;
  const githubMergeStatus = requiredTruthyField(
    row.githubMergeStatus,
    "githubMergeStatus",
    context,
  );
  const githubIssueNumber = requiredTruthyField(
    row.githubIssueNumber,
    "githubIssueNumber",
    context,
  );
  const githubIssueId = requiredNonEmptyString(
    row.githubIssueId,
    "githubIssueId",
    context,
  );
  const agentStatus = requiredTruthyField(row.agentStatus, "agentStatus", context);
  const agentBranch = requiredNonEmptyString(
    row.agentBranch,
    "agentBranch",
    context,
  );
  const summaryOfFindings = requiredNonEmptyString(
    row.summaryOfFindings,
    "summaryOfFindings",
    context,
  );
  const githubAgentRunId = row.githubAgentRunId ?? undefined;
  const failingTestCommitSha = row.failingTestCommitSha ?? undefined;

  switch (requiredTruthyField(row.outcome, "outcome", context)) {
    case "reproduced":
      return new FailingTestReproSucceededResultEntity(
        githubMergeStatus,
        githubIssueNumber,
        githubIssueId,
        agentStatus,
        agentBranch,
        summaryOfFindings,
        requiredTruthyField(row.confidenceLevel, "confidenceLevel", context),
        parseFailingTestPaths(row.failingTestPath) ?? [],
        githubAgentRunId,
        failingTestCommitSha,
        rawResultJson,
      );
    case "not_reproducible":
      return new FailingTestReproNotReproducibleResultEntity(
        githubMergeStatus,
        githubIssueNumber,
        githubIssueId,
        agentStatus,
        agentBranch,
        summaryOfFindings,
        requiredTruthyField(row.confidenceLevel, "confidenceLevel", context),
        githubAgentRunId,
        failingTestCommitSha,
        rawResultJson,
      );
    case "needs_user_feedback": {
      const feedbackRequest = parseFeedbackRequest(rawResultJson);
      if (!feedbackRequest) {
        throw new Error(`Missing feedbackRequest for ${context}`);
      }

      return new FailingTestReproNeedsUserFeedbackResultEntity(
        githubMergeStatus,
        githubIssueNumber,
        githubIssueId,
        agentStatus,
        agentBranch,
        summaryOfFindings,
        feedbackRequest,
        githubAgentRunId,
        failingTestCommitSha,
        rawResultJson,
      );
    }
    case "agent_error":
      return new FailingTestReproAgentErrorResultEntity(
        githubMergeStatus,
        githubIssueNumber,
        githubIssueId,
        agentStatus,
        agentBranch,
        summaryOfFindings,
        requiredNonEmptyString(row.failureReason, "failureReason", context),
        githubAgentRunId,
        failingTestCommitSha,
        rawResultJson,
      );
    case "cancelled":
      return new FailingTestReproCancelledResultEntity(
        githubMergeStatus,
        githubIssueNumber,
        githubIssueId,
        agentStatus,
        agentBranch,
        summaryOfFindings,
        row.failureReason ?? undefined,
        githubAgentRunId,
        failingTestCommitSha,
        rawResultJson,
      );
  }
}

export const failingTestReproStepDefinition: StepExecutionDefinition<FailingTestReproStepExecutionEntity> =
  {
    stepName: FAILING_TEST_REPRO_STEP_NAME,
    isExecution: (
      execution,
    ): execution is FailingTestReproStepExecutionEntity =>
      execution instanceof FailingTestReproStepExecutionEntity,
    createQueuedExecution: ({ pipelineId, ticketId, now }) =>
      new FailingTestReproStepExecutionEntity(
        pipelineId,
        ticketId,
        "queued",
        null,
        null,
        now ?? new Date().toISOString(),
      ),
    deserializeExecution: (row, ticketId = row.ticketId) =>
      new FailingTestReproStepExecutionEntity(
        row.pipelineId,
        ticketId,
        row.status,
        deserializeResult(row),
        row.githubPrTargetBranch ?? null,
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
        row.failureReason ?? undefined,
      ),
    serializeExecution: ({ execution, endedAt, now }) => {
      const reproResult = execution.result;
      const confidenceLevel =
        reproResult?.outcome === "reproduced" ||
        reproResult?.outcome === "not_reproducible"
          ? reproResult.confidenceLevel
          : null;
      const failingTestPaths =
        reproResult?.outcome === "reproduced"
          ? reproResult.failingTestPaths
          : undefined;
      const failureReason =
        reproResult?.outcome === "agent_error" ||
        reproResult?.outcome === "cancelled"
          ? reproResult.failureReason
          : null;

      return {
        ...buildDiscriminatorResetFields(),
        githubIssueNumber: reproResult?.githubIssueNumber ?? null,
        githubIssueId: reproResult?.githubIssueId ?? null,
        githubAgentRunId: reproResult?.githubAgentRunId ?? null,
        agentStatus: reproResult?.agentStatus ?? null,
        githubMergeStatus: reproResult?.githubMergeStatus ?? "draft",
        githubPrTargetBranch: execution.githubPrTargetBranch,
        agentBranch: reproResult?.agentBranch ?? null,
        failingTestCommitSha: reproResult?.failingTestCommitSha ?? null,
        failureReason,
        rawResultJson: reproResult?.rawResultJson ?? null,
        completedAt: endedAt,
        lastPolledAt: now,
        outcome: reproResult?.outcome ?? null,
        failingTestPath: serializeFailingTestPaths(failingTestPaths),
        summaryOfFindings: reproResult?.summaryOfFindings ?? null,
        confidenceLevel,
      };
    },
    mapResultToContract: (execution) => {
      if (!execution.result) {
        return null;
      }

      return failingTestReproStepResultContractSchema.parse({
        executionId: execution.id,
        stepName: execution.stepName,
        githubIssueNumber: execution.result.githubIssueNumber ?? null,
        githubIssueId: execution.result.githubIssueId ?? null,
        githubAgentRunId: execution.result.githubAgentRunId ?? null,
        githubMergeStatus: execution.result.githubMergeStatus,
        githubPrTargetBranch: execution.githubPrTargetBranch,
        agentStatus: execution.result.agentStatus ?? null,
        agentBranch: execution.result.agentBranch ?? null,
        failingTestPaths:
          execution.result.outcome === "reproduced"
            ? execution.result.failingTestPaths
            : null,
        failingTestCommitSha: execution.result.failingTestCommitSha ?? null,
        outcome: execution.result.outcome ?? null,
        summaryOfFindings: execution.result.summaryOfFindings ?? null,
        confidenceLevel:
          execution.result.outcome === "reproduced" ||
          execution.result.outcome === "not_reproducible"
            ? execution.result.confidenceLevel
            : null,
        feedbackRequest:
          execution.result.outcome === "needs_user_feedback"
            ? execution.result.feedbackRequest
            : null,
        failureReason:
          execution.result.outcome === "agent_error" ||
          execution.result.outcome === "cancelled"
            ? execution.result.failureReason ?? null
            : null,
        rawResultJson: execution.result.rawResultJson ?? null,
        createdAt: execution.createdAt,
        updatedAt: execution.updatedAt,
      });
    },
    shouldAdvance: (execution) => {
      if (execution.status !== "succeeded" || !execution.result) {
        return false;
      }

      if (
        !("confidenceLevel" in execution.result) ||
        typeof execution.result.confidenceLevel !== "number"
      ) {
        return false;
      }

      return (
        execution.result.confidenceLevel >=
        REPRO_CONFIDENCE_ADVANCEMENT_THRESHOLD
      );
    },
  };
