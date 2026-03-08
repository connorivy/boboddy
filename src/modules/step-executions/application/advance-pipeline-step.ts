"use server";

import { randomUUID } from "node:crypto";
import { AppContext } from "@/lib/di";
import { stepExecutionEntityToContract } from "@/modules/step-executions/application/step-execution-entity-to-contract";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import {
  advancePipelineStepRequestSchema,
  advancePipelineStepResponseSchema,
  type AdvancePipelineStepRequest,
  type AdvancePipelineStepResponse,
} from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { pipelineRunEntityToContract } from "@/modules/pipeline-runs/application/pipeline-run-entity-to-contract";
import type { PipelineRunRepo } from "@/modules/pipeline-runs/application/pipeline-run-repo";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-entity";
import { ACTIVE_PIPELINE_RUN_STATUSES } from "@/modules/pipeline-runs/domain/pipeline-run.types";
import {
  PIPELINE_DEFINITION_VERSION,
  PIPELINE_STEP_ORDER,
  type StepExecutionStatus,
} from "@/modules/step-executions/domain/step-execution.types";
import { triggerTicketDescriptionEnrichmentStep } from "@/modules/step-executions/application/trigger-ticket-description-enrichment-step";
import { triggerTicketDescriptionQualityStep } from "@/modules/step-executions/application/trigger-ticket-description-quality-step";
import { triggerTicketDuplicateCandidatesStep } from "@/modules/step-executions/application/trigger-ticket-duplicate-candidates-step";
import { triggerTicketFailingTestReproStep } from "@/modules/step-executions/application/trigger-ticket-failing-test-repro-step";
import { triggerTicketFailingTestFixStep } from "@/modules/step-executions/application/trigger-ticket-failing-test-fix-step";
import type { TicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { TicketGitEnvironmentRepo } from "@/modules/environments/application/ticket-git-environment-repo";
import type { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";
import type { DrizzleTicketVectorRepo } from "@/modules/step-executions/infra/ticket-vector.repository";

type AdvancePipelineDeps = {
  ticketRepo: TicketRepo;
  stepExecutionRepo: StepExecutionRepo;
  pipelineRunRepo: PipelineRunRepo;
  ticketVectorRepo: DrizzleTicketVectorRepo;
  ticketGitEnvironmentRepo: TicketGitEnvironmentRepo;
  githubService: Pick<
    GithubApiService,
    "assignCopilot" | "unassignCopilot" | "createIssue"
  >;
};

const isAdvanceAllowed = (status: StepExecutionStatus): boolean =>
  status === "succeeded" || status === "skipped";

const buildRunFromExecutionState = (
  run: PipelineRunEntity,
  executionStatus: StepExecutionStatus,
  currentStepName: string,
  currentStepExecutionId: number | null,
): PipelineRunEntity => {
  const now = new Date().toISOString();

  if (executionStatus === "waiting_for_user_feedback") {
    return new PipelineRunEntity(
      run.id,
      run.ticketId,
      "halted",
      currentStepName,
      currentStepExecutionId,
      run.lastCompletedStepName,
      `Step '${currentStepName}' is waiting for user feedback`,
      run.startedAt,
      null,
      run.pipelineType,
      run.definitionVersion,
      run.createdAt,
      run.updatedAt,
    );
  }

  if (executionStatus === "failed" || executionStatus === "failed_timeout") {
    return new PipelineRunEntity(
      run.id,
      run.ticketId,
      "failed",
      currentStepName,
      currentStepExecutionId,
      run.lastCompletedStepName,
      `Step '${currentStepName}' ${executionStatus === "failed_timeout" ? "timed out" : "failed"}`,
      run.startedAt,
      now,
      run.pipelineType,
      run.definitionVersion,
      run.createdAt,
      run.updatedAt,
    );
  }

  if (executionStatus === "queued" || executionStatus === "running") {
    return new PipelineRunEntity(
      run.id,
      run.ticketId,
      "waiting",
      currentStepName,
      currentStepExecutionId,
      run.lastCompletedStepName,
      null,
      run.startedAt,
      null,
      run.pipelineType,
      run.definitionVersion,
      run.createdAt,
      run.updatedAt,
    );
  }

  return new PipelineRunEntity(
    run.id,
    run.ticketId,
    "running",
    currentStepName,
    currentStepExecutionId,
    run.lastCompletedStepName,
    null,
    run.startedAt,
    null,
    run.pipelineType,
    run.definitionVersion,
    run.createdAt,
    run.updatedAt,
  );
};

const startStep = async (
  stepName: (typeof PIPELINE_STEP_ORDER)[number],
  run: PipelineRunEntity,
  deps: AdvancePipelineDeps,
) => {
  if (stepName === PIPELINE_STEP_ORDER[0]) {
    return triggerTicketDescriptionEnrichmentStep(
      { ticketId: run.ticketId, pipelineRunId: run.id },
      deps,
    );
  }

  if (stepName === PIPELINE_STEP_ORDER[1]) {
    return triggerTicketDescriptionQualityStep(
      { ticketId: run.ticketId, pipelineRunId: run.id },
      deps,
    );
  }

  if (stepName === PIPELINE_STEP_ORDER[2]) {
    return triggerTicketDuplicateCandidatesStep(
      { ticketId: run.ticketId, pipelineRunId: run.id },
      deps,
    );
  }

  if (stepName === PIPELINE_STEP_ORDER[3]) {
    return triggerTicketFailingTestReproStep(
      { ticketId: run.ticketId, pipelineRunId: run.id },
      deps,
    );
  }

  return triggerTicketFailingTestFixStep(
    { ticketId: run.ticketId, pipelineRunId: run.id },
    deps,
  );
};

const persistAndRespond = async (
  run: PipelineRunEntity,
  deps: AdvancePipelineDeps,
): Promise<AdvancePipelineStepResponse> => {
  const executions = await deps.pipelineRunRepo.loadExecutions(run.id);

  return advancePipelineStepResponseSchema.parse({
    ok: true,
    data: {
      pipeline: pipelineRunEntityToContract(run, executions),
    },
  });
};

export const advancePipelineStep = async (
  rawInput: AdvancePipelineStepRequest,
  deps: AdvancePipelineDeps = AppContext,
): Promise<AdvancePipelineStepResponse> => {
  const input = advancePipelineStepRequestSchema.parse(rawInput);

  const ticket = await deps.ticketRepo.loadById(input.ticketId);
  if (!ticket) {
    throw new Error(`Ticket with ID ${input.ticketId} not found`);
  }

  const existingRun = input.pipelineRunId
    ? await deps.pipelineRunRepo.load(input.pipelineRunId)
    : await deps.pipelineRunRepo.loadLatestOrActiveByTicketId(input.ticketId);

  let run =
    existingRun && ACTIVE_PIPELINE_RUN_STATUSES.has(existingRun.status)
      ? existingRun
      : null;

  if (!run) {
    run = await deps.pipelineRunRepo.save(
      new PipelineRunEntity(
        randomUUID(),
        input.ticketId,
        "queued",
        null,
        null,
        null,
        null,
        new Date().toISOString(),
        null,
        "default",
        PIPELINE_DEFINITION_VERSION,
      ),
    );
  }

  const executions = await deps.pipelineRunRepo.loadExecutions(run.id);
  const latestExecution = executions[0] ?? null;

  if (!latestExecution) {
    const started = await startStep(PIPELINE_STEP_ORDER[0], run, deps);
    const execution = started.data.stepExecution;
    const nextRun = await deps.pipelineRunRepo.save(
      buildRunFromExecutionState(
        run,
        execution.status,
        execution.stepName,
        execution.id,
      ),
    );

    if (isAdvanceAllowed(execution.status)) {
      return advancePipelineStep(
        { ticketId: run.ticketId, pipelineRunId: run.id },
        deps,
      );
    }

    return persistAndRespond(nextRun, deps);
  }

  if (latestExecution.status === "queued" || latestExecution.status === "running") {
    const waitingRun = await deps.pipelineRunRepo.save(
      buildRunFromExecutionState(
        run,
        latestExecution.status,
        latestExecution.stepName,
        latestExecution.id ?? null,
      ),
    );
    return persistAndRespond(waitingRun, deps);
  }

  if (latestExecution.status === "waiting_for_user_feedback") {
    const haltedRun = await deps.pipelineRunRepo.save(
      buildRunFromExecutionState(
        run,
        latestExecution.status,
        latestExecution.stepName,
        latestExecution.id ?? null,
      ),
    );
    return persistAndRespond(haltedRun, deps);
  }

  if (
    latestExecution.status === "failed" ||
    latestExecution.status === "failed_timeout"
  ) {
    const failedRun = await deps.pipelineRunRepo.save(
      buildRunFromExecutionState(
        run,
        latestExecution.status,
        latestExecution.stepName,
        latestExecution.id ?? null,
      ),
    );
    return persistAndRespond(failedRun, deps);
  }

  const latestStepIndex = PIPELINE_STEP_ORDER.indexOf(
    latestExecution.stepName as (typeof PIPELINE_STEP_ORDER)[number],
  );
  if (latestStepIndex < 0) {
    throw new Error(`Unknown pipeline step '${latestExecution.stepName}'`);
  }

  run = await deps.pipelineRunRepo.save(
    new PipelineRunEntity(
      run.id,
      run.ticketId,
      "running",
      latestExecution.stepName,
      latestExecution.id ?? null,
      latestExecution.stepName,
      null,
      run.startedAt,
      null,
      run.pipelineType,
      run.definitionVersion,
      run.createdAt,
      run.updatedAt,
    ),
  );

  const nextStepName = PIPELINE_STEP_ORDER[latestStepIndex + 1];
  if (!nextStepName) {
    const completedRun = await deps.pipelineRunRepo.save(
      new PipelineRunEntity(
        run.id,
        run.ticketId,
        "succeeded",
        null,
        null,
        latestExecution.stepName,
        null,
        run.startedAt,
        new Date().toISOString(),
        run.pipelineType,
        run.definitionVersion,
        run.createdAt,
        run.updatedAt,
      ),
    );
    return persistAndRespond(completedRun, deps);
  }

  const previousExecution = executions.find(
    (execution) => execution.stepName === latestExecution.stepName,
  );
  if (!previousExecution || !isAdvanceAllowed(previousExecution.status)) {
    return persistAndRespond(run, deps);
  }

  const nextExecution = executions.find(
    (execution) => execution.stepName === nextStepName,
  );
  if (
    nextExecution &&
    (nextExecution.status === "queued" || nextExecution.status === "running")
  ) {
    const waitingRun = await deps.pipelineRunRepo.save(
      buildRunFromExecutionState(
        run,
        nextExecution.status,
        nextExecution.stepName,
        nextExecution.id ?? null,
      ),
    );
    return persistAndRespond(waitingRun, deps);
  }

  if (
    nextExecution &&
    !isAdvanceAllowed(nextExecution.status) &&
    nextExecution.status !== "queued" &&
    nextExecution.status !== "running"
  ) {
    const updatedRun = await deps.pipelineRunRepo.save(
      buildRunFromExecutionState(
        run,
        nextExecution.status,
        nextExecution.stepName,
        nextExecution.id ?? null,
      ),
    );
    return persistAndRespond(updatedRun, deps);
  }

  if (nextExecution && isAdvanceAllowed(nextExecution.status)) {
    return advancePipelineStep(
      { ticketId: run.ticketId, pipelineRunId: run.id },
      deps,
    );
  }

  const started = await startStep(nextStepName, run, deps);
  const startedExecution = started.data.stepExecution;
  const updatedRun = await deps.pipelineRunRepo.save(
    buildRunFromExecutionState(
      run,
      startedExecution.status,
      startedExecution.stepName,
      startedExecution.id,
    ),
  );

  if (isAdvanceAllowed(startedExecution.status)) {
    return advancePipelineStep(
      { ticketId: run.ticketId, pipelineRunId: run.id },
      deps,
    );
  }

  return persistAndRespond(updatedRun, deps);
};

export const advancePipelineStepExecutionToContract = stepExecutionEntityToContract;
