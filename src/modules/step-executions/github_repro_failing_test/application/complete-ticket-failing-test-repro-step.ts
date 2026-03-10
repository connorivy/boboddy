import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  completeTicketFailingTestReproStepRequestSchema,
  completeTicketFailingTestReproStepResponseSchema,
  type CompleteTicketFailingTestReproStepRequest,
  type CompleteTicketFailingTestReproStepResponse,
} from "@/modules/step-executions/github_repro_failing_test/contracts/complete-ticket-failing-test-repro-step-contracts";
import { FAILING_TEST_REPRO_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import type { StepExecutionStatus } from "@/modules/tickets/contracts/ticket-contracts";
import { httpError } from "@/lib/api/http";
import { AppContext } from "@/lib/di";
import type { TimeProvider } from "@/lib/time-provider";
import {
  FailingTestReproAgentErrorResultEntity,
  FailingTestReproCancelledResultEntity,
  FailingTestReproNeedsUserFeedbackResultEntity,
  FailingTestReproNotReproducibleResultEntity,
  FailingTestReproStepExecutionEntity,
  FailingTestReproSucceededResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

const resolveStatus = (
  input: CompleteTicketFailingTestReproStepRequest,
): StepExecutionStatus => {
  if (input.reproduceOperationOutcome === "needs_user_feedback") {
    return "waiting_for_user_feedback";
  }

  if (
    input.reproduceOperationOutcome === "reproduced" ||
    input.reproduceOperationOutcome === "not_reproducible"
  ) {
    return "succeeded";
  }

  if (input.agentStatus === "timeout") {
    return "failed_timeout";
  }

  return "failed";
};

export const completeTicketFailingTestReproStep = async (
  rawInput: CompleteTicketFailingTestReproStepRequest,
  {
    stepExecutionRepo,
    ticketRepo,
    timeProvider,
  }: {
    stepExecutionRepo: StepExecutionRepo;
    ticketRepo: TicketRepo;
    timeProvider: TimeProvider;
  } = AppContext,
): Promise<CompleteTicketFailingTestReproStepResponse> => {
  const input = completeTicketFailingTestReproStepRequestSchema.parse(rawInput);

  const existingExecution = await stepExecutionRepo.load(input.stepExecutionId);
  if (!existingExecution) {
    throw httpError("Pipeline step execution not found", 404);
  }

  if (existingExecution.stepName !== FAILING_TEST_REPRO_STEP_NAME) {
    throw httpError(
      "Pipeline step execution is not a failing-test repro step",
      409,
    );
  }
  if (!(existingExecution instanceof FailingTestReproStepExecutionEntity)) {
    throw httpError(
      "Pipeline step execution payload is not a failing-test repro result",
      409,
    );
  }

  const ticket = await ticketRepo.loadById(existingExecution.ticketId, {
    loadGithubIssue: true,
  });
  if (!ticket?.githubIssue) {
    throw httpError(
      "Cannot complete failing-test repro step without a linked GitHub issue",
      409,
    );
  }

  const endedAt = timeProvider.now();
  const nextStatus = resolveStatus(input);
  const shouldRemainOpen = nextStatus === "waiting_for_user_feedback";
  const rawResultJson = {
    ...(existingExecution.result?.rawResultJson ?? {}),
    feedbackRequest: input.feedbackRequest ?? null,
  };
  const githubMergeStatus =
    existingExecution.result?.githubMergeStatus ?? "draft";
  const githubAgentRunId = existingExecution.result?.githubAgentRunId;
  const failingTestCommitSha = existingExecution.result?.failingTestCommitSha;

  const nextResult = (() => {
    switch (input.reproduceOperationOutcome) {
      case "reproduced":
        return new FailingTestReproSucceededResultEntity(
          githubMergeStatus,
          ticket.githubIssue.githubIssueNumber,
          ticket.githubIssue.githubIssueId,
          input.agentStatus,
          input.agentBranch,
          input.summaryOfFindings,
          input.confidenceLevel,
          input.failingTestPaths,
          githubAgentRunId,
          failingTestCommitSha,
          rawResultJson,
        );
      case "not_reproducible":
        return new FailingTestReproNotReproducibleResultEntity(
          githubMergeStatus,
          ticket.githubIssue.githubIssueNumber,
          ticket.githubIssue.githubIssueId,
          input.agentStatus,
          input.agentBranch,
          input.summaryOfFindings,
          input.confidenceLevel,
          githubAgentRunId,
          failingTestCommitSha,
          rawResultJson,
        );
      case "needs_user_feedback":
        return new FailingTestReproNeedsUserFeedbackResultEntity(
          githubMergeStatus,
          ticket.githubIssue.githubIssueNumber,
          ticket.githubIssue.githubIssueId,
          input.agentStatus,
          input.agentBranch,
          input.summaryOfFindings,
          input.feedbackRequest,
          githubAgentRunId,
          failingTestCommitSha,
          rawResultJson,
        );
      case "agent_error":
        return new FailingTestReproAgentErrorResultEntity(
          githubMergeStatus,
          ticket.githubIssue.githubIssueNumber,
          ticket.githubIssue.githubIssueId,
          input.agentStatus,
          input.agentBranch,
          input.summaryOfFindings,
          existingExecution.failureReason ??
            "Agent reported an error while attempting reproduction",
          githubAgentRunId,
          failingTestCommitSha,
          rawResultJson,
        );
      case "cancelled":
        return new FailingTestReproCancelledResultEntity(
          githubMergeStatus,
          ticket.githubIssue.githubIssueNumber,
          ticket.githubIssue.githubIssueId,
          input.agentStatus,
          input.agentBranch,
          input.summaryOfFindings,
          existingExecution.failureReason,
          githubAgentRunId,
          failingTestCommitSha,
          rawResultJson,
        );
    }
  })();

  existingExecution.setResult({
    status: nextStatus,
    endedAt: shouldRemainOpen ? undefined : endedAt,
    result: nextResult,
    githubPrTargetBranch: existingExecution.githubPrTargetBranch,
  });

  const savedExecution = await stepExecutionRepo.save(existingExecution);

  return completeTicketFailingTestReproStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
