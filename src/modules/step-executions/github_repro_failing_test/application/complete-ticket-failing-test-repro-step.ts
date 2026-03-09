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
import {
  FailingTestReproStepExecutionEntity,
  FailingTestReproStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

const resolveStatus = (
  input: CompleteTicketFailingTestReproStepRequest,
): StepExecutionStatus => {
  if (input.reproduceOperationOutcome === "needs_user_feedback") {
    return "waiting_for_user_feedback";
  }

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
    input.reproduceOperationOutcome === "reproduced" ||
    input.reproduceOperationOutcome === "not_reproducible"
  ) {
    return "succeeded";
  }

  return "failed";
};

export const completeTicketFailingTestReproStep = async (
  rawInput: CompleteTicketFailingTestReproStepRequest,
  {
    stepExecutionRepo,
    ticketRepo,
  }: {
    stepExecutionRepo: StepExecutionRepo;
    ticketRepo: TicketRepo;
  } = AppContext,
): Promise<CompleteTicketFailingTestReproStepResponse> => {
  const input = completeTicketFailingTestReproStepRequestSchema.parse(rawInput);

  const existingExecution = await stepExecutionRepo.load(input.pipelineId);
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

  const ticket = await ticketRepo.loadById(input.ticketId, {
    loadGithubIssue: true,
  });
  if (!ticket?.githubIssue) {
    throw httpError(
      "Cannot complete failing-test repro step without a linked GitHub issue",
      409,
    );
  }

  const endedAt = new Date().toISOString();
  const nextStatus = resolveStatus(input);
  const shouldRemainOpen = nextStatus === "waiting_for_user_feedback";
  const rawResultJson = {
    ...(existingExecution.result?.rawResultJson ?? {}),
    feedbackRequest: input.feedbackRequest ?? null,
  };

  const savedExecution = await stepExecutionRepo.save(
    new FailingTestReproStepExecutionEntity(
      existingExecution.pipelineId,
      existingExecution.ticketId,
      nextStatus,
      existingExecution.idempotencyKey,
      new FailingTestReproStepResultEntity(
        existingExecution.result?.githubMergeStatus ?? "draft",
        ticket.githubIssue.githubIssueNumber,
        ticket.githubIssue.githubIssueId,
        input.agentStatus,
        existingExecution.result?.githubPrTargetBranch ?? input.agentBranch,
        input.agentBranch,
        input.reproduceOperationOutcome,
        input.summaryOfFindings,
        input.confidenceLevel,
        existingExecution.result?.githubAgentRunId,
        input.failingTestPaths ?? undefined,
        existingExecution.result?.failingTestCommitSha,
        existingExecution.result?.failureReason,
        rawResultJson,
        input.feedbackRequest ?? undefined,
      ),
      existingExecution.startedAt,
      shouldRemainOpen ? undefined : endedAt,
      existingExecution.createdAt,
      existingExecution.updatedAt,
      existingExecution.id,
    ),
  );

  return completeTicketFailingTestReproStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
