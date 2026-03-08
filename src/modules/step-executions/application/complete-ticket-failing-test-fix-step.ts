"use server";

import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import {
  completeTicketFailingTestFixStepRequestSchema,
  completeTicketFailingTestFixStepResponseSchema,
  type CompleteTicketFailingTestFixStepRequest,
  type CompleteTicketFailingTestFixStepResponse,
} from "@/modules/step-executions/contracts/complete-ticket-failing-test-fix-step-contracts";
import { FAILING_TEST_FIX_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import type { StepExecutionStatus } from "@/modules/tickets/contracts/ticket-contracts";
import { httpError } from "@/lib/api/http";
import { AppContext } from "@/lib/di";
import { advancePipelineStep } from "@/modules/step-executions/application/advance-pipeline-step";
import {
  FailingTestFixStepCompletionResultEntity,
  FailingTestFixStepExecutionEntity,
  FailingTestFixStepResultEntity,
} from "../domain/step-execution-entity";

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
  deps: Partial<{
    stepExecutionRepo: typeof AppContext.stepExecutionRepo;
    ticketRepo: typeof AppContext.ticketRepo;
    pipelineRunRepo: typeof AppContext.pipelineRunRepo;
    ticketVectorRepo: typeof AppContext.ticketVectorRepo;
    ticketGitEnvironmentRepo: typeof AppContext.ticketGitEnvironmentRepo;
    githubService: typeof AppContext.githubService;
  }> = {},
): Promise<CompleteTicketFailingTestFixStepResponse> => {
  const input = completeTicketFailingTestFixStepRequestSchema.parse(rawInput);
  const stepExecutionRepo = deps.stepExecutionRepo ?? AppContext.stepExecutionRepo;

  const existingExecution = await stepExecutionRepo.load(input.stepExecutionId);
  if (
    !existingExecution ||
    existingExecution.ticketId !== input.ticketId ||
    existingExecution.pipelineRunId !== input.pipelineRunId
  ) {
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

  const endedAt = new Date().toISOString();

  const savedExecution = await stepExecutionRepo.save(
    new FailingTestFixStepExecutionEntity(
      existingExecution.ticketId,
      existingExecution.pipelineRunId,
      resolveStatus(input),
      existingExecution.idempotencyKey,
      new FailingTestFixStepResultEntity(
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
      existingExecution.startedAt,
      endedAt,
      existingExecution.createdAt,
      existingExecution.updatedAt,
      existingExecution.id,
    ),
  );

  const advancedPipeline = await advancePipelineStep(
    {
      ticketId: input.ticketId,
      pipelineRunId: input.pipelineRunId,
    },
    {
      stepExecutionRepo,
      ticketRepo: deps.ticketRepo ?? AppContext.ticketRepo,
      pipelineRunRepo: deps.pipelineRunRepo ?? AppContext.pipelineRunRepo,
      ticketVectorRepo: deps.ticketVectorRepo ?? AppContext.ticketVectorRepo,
      ticketGitEnvironmentRepo:
        deps.ticketGitEnvironmentRepo ?? AppContext.ticketGitEnvironmentRepo,
      githubService: deps.githubService ?? AppContext.githubService,
    },
  );

  return completeTicketFailingTestFixStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
      pipeline: advancedPipeline.data.pipeline,
    },
  });
};
