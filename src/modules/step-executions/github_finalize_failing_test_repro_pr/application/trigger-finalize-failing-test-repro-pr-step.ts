"use server";

import { AppContext } from "@/lib/di";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import { mergeFailingTest } from "@/modules/step-executions/github_fix_failing_test/application/merge-failing-test";
import {
  FailingTestReproStepExecutionEntity,
  FinalizeFailingTestReproPrStepExecutionEntity,
  FinalizeFailingTestReproPrStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import { TERMINAL_STEP_EXECUTION_STATUSES } from "@/modules/step-executions/domain/step-execution.types";
import type { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";
import {
  triggerFinalizeFailingTestReproPrStepRequestSchema,
  triggerFinalizeFailingTestReproPrStepResponseSchema,
  type TriggerFinalizeFailingTestReproPrStepRequest,
  type TriggerFinalizeFailingTestReproPrStepResponse,
} from "@/modules/step-executions/github_finalize_failing_test_repro_pr/contracts/trigger-finalize-failing-test-repro-pr-step-contracts";

export const triggerFinalizeFailingTestReproPrStep = async (
  rawInput: TriggerFinalizeFailingTestReproPrStepRequest,
  {
    stepExecutionRepo,
    githubService,
  }: {
    stepExecutionRepo: StepExecutionRepo;
    githubService: GithubApiService;
  } = AppContext,
): Promise<TriggerFinalizeFailingTestReproPrStepResponse> => {
  const input =
    triggerFinalizeFailingTestReproPrStepRequestSchema.parse(rawInput);

  const now = AppContext.timeProvider.nowIso();
  const execution = new FinalizeFailingTestReproPrStepExecutionEntity(
    null,
    input.ticketId,
    "running",
    null,
    now,
  );

  let savedExecution = await stepExecutionRepo.save(execution);

  try {
    if (!savedExecution.pipelineId) {
      throw new Error(
        `Finalize repro PR step ${savedExecution.id} is missing a pipeline ID`,
      );
    }

    const pipelineSteps = await stepExecutionRepo.loadByPipelineId(
      savedExecution.pipelineId,
    );
    const reproStep = pipelineSteps.find(
      (step): step is FailingTestReproStepExecutionEntity =>
        step instanceof FailingTestReproStepExecutionEntity,
    );

    if (!reproStep) {
      throw new Error(
        `Could not find a failing test repro step for pipeline ${savedExecution.pipelineId}`,
      );
    }

    if (reproStep.status !== "succeeded" || !reproStep.result) {
      throw new Error(
        `Failing test repro step ${reproStep.id} is not in a mergeable state`,
      );
    }

    const githubPrTargetBranch = reproStep.githubPrTargetBranch?.trim();
    const agentBranch = reproStep.result.agentBranch?.trim();
    if (!githubPrTargetBranch || !agentBranch) {
      throw new Error(
        `Failing test repro step ${reproStep.id} is missing branch metadata`,
      );
    }

    if (reproStep.result.githubMergeStatus !== "merged") {
      await githubService.markPullRequestReadyForReview(
        githubPrTargetBranch,
        agentBranch,
      );
      await mergeFailingTest(input.ticketId, reproStep.id, {
        ticketRepo: AppContext.ticketRepo,
        ticketGitEnvironmentRepo: AppContext.ticketGitEnvironmentRepo,
        stepExecutionRepo,
        githubService,
      });
    }

    savedExecution.setResult({
      status: "succeeded",
      endedAt: AppContext.timeProvider.nowIso(),
      result: new FinalizeFailingTestReproPrStepResultEntity(
        "merged",
        reproStep.result.githubIssueNumber,
        reproStep.result.githubIssueId,
        githubPrTargetBranch,
        agentBranch,
      ),
    });
    savedExecution = await stepExecutionRepo.save(savedExecution);
  } catch (error) {
    if (!TERMINAL_STEP_EXECUTION_STATUSES.has(savedExecution.status)) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      savedExecution.setResult({
        status: "failed",
        endedAt: AppContext.timeProvider.nowIso(),
        failureReason: errorMessage,
      });
      await stepExecutionRepo.save(savedExecution);
    }
    throw error;
  }

  return triggerFinalizeFailingTestReproPrStepResponseSchema.parse({
    ok: true,
    data: {
      stepExecution: stepExecutionEntityToContract(savedExecution),
    },
  });
};
