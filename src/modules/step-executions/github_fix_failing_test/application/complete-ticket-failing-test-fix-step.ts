import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  completeTicketFailingTestFixStepRequestSchema,
  completeTicketFailingTestFixStepResponseSchema,
  type CompleteTicketFailingTestFixStepRequest,
  type CompleteTicketFailingTestFixStepResponse,
} from "@/modules/step-executions/github_fix_failing_test/contracts/complete-ticket-failing-test-fix-step-contracts";
import { FAILING_TEST_FIX_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import type { StepExecutionStatus } from "@/modules/tickets/contracts/ticket-contracts";
import { httpError } from "@/lib/api/http";
import { AppContext } from "@/lib/di";
import {
  FailingTestFixStepCompletionResultEntity,
  FailingTestFixStepExecutionEntity,
  FailingTestFixStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";

const resolveStatus = (
  input: CompleteTicketFailingTestFixStepRequest,
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
    input.fixOperationOutcome === "fixed" ||
    input.fixOperationOutcome === "not_fixed"
  ) {
    return "succeeded";
  }

  return "failed";
};

export const completeTicketFailingTestFixStep = async (
  rawInput: CompleteTicketFailingTestFixStepRequest,
  { stepExecutionRepo } = AppContext,
): Promise<CompleteTicketFailingTestFixStepResponse> => {
  const input = completeTicketFailingTestFixStepRequestSchema.parse(rawInput);

  const existingExecution = await stepExecutionRepo.load(input.stepExecutionId);
  if (!existingExecution) {
    throw httpError("Pipeline step execution not found", 404);
  }

  if (existingExecution.stepName !== FAILING_TEST_FIX_STEP_NAME) {
    throw httpError(
      "Pipeline step execution is not a failing-test fix step",
      409,
    );
  }

  if (!(existingExecution instanceof FailingTestFixStepExecutionEntity)) {
    throw httpError(
      "Pipeline step execution payload is not a failing-test fix result",
      409,
    );
  }
  if (!existingExecution.result) {
    throw httpError(
      "Pipeline step execution is missing failing-test fix metadata payload",
      409,
    );
  }

  const endedAt = AppContext.timeProvider.now();

  existingExecution.setResult({
    status: resolveStatus(input),
    endedAt,
    result: new FailingTestFixStepResultEntity(
      existingExecution.result.githubMergeStatus,
      existingExecution.result.githubIssueNumber,
      existingExecution.result.githubIssueId,
      existingExecution.result.githubPrTargetBranch,
      new FailingTestFixStepCompletionResultEntity(
        input.agentStatus,
        input.agentBranch,
        input.fixOperationOutcome,
        input.summaryOfFix,
        input.fixConfidenceLevel ?? 0,
        input.fixedTestPath ?? undefined,
        existingExecution.result.completionResult?.failureReason,
        existingExecution.result.completionResult?.rawResultJson,
      ),
      existingExecution.result.githubAgentRunId,
      existingExecution.result.agentSummary,
      existingExecution.result.failingTestPath,
      existingExecution.result.failingTestCommitSha,
    ),
  });

  const savedExecution = await stepExecutionRepo.save(existingExecution);

  return completeTicketFailingTestFixStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
