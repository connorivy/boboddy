"use server";

import { randomUUID } from "node:crypto";
import { AppContext } from "@/lib/di";
import { type PipelineRunContract } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { pipelineRunEntityToContract } from "./pipeline-run-entity-to-contract";
import type { PipelineRunRepo } from "./pipeline-run-repo";
import { httpError } from "@/lib/api/http";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
  type StepExecutionStepName,
} from "@/modules/step-executions/domain/step-execution.types";
import {
  FailingTestFixStepExecutionEntity,
  FailingTestReproStepExecutionEntity,
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionQualityStepExecutionEntity,
  TicketDuplicateCandidatesStepResultEntity,
  type TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";

const PIPELINE_STEP_SEQUENCE: StepExecutionStepName[] = [
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  FAILING_TEST_FIX_STEP_NAME,
];

function buildQueuedStepExecution(
  pipelineId: string,
  stepName: StepExecutionStepName,
): TicketPipelineStepExecutionEntity {
  const now = new Date().toISOString();
  const idempotencyKey = `${stepName}:${pipelineId}:${randomUUID()}`;

  switch (stepName) {
    case TICKET_DESCRIPTION_QUALITY_STEP_NAME:
      return new TicketDescriptionQualityStepExecutionEntity(
        pipelineId,
        "queued",
        idempotencyKey,
        null,
        now,
      );
    case TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME:
      return new TicketDescriptionEnrichmentStepExecutionEntity(
        pipelineId,
        "queued",
        idempotencyKey,
        null,
        now,
      );
    case TICKET_DUPLICATE_CANDIDATES_STEP_NAME:
      return new TicketDuplicateCandidatesStepResultEntity(
        pipelineId,
        "queued",
        idempotencyKey,
        null,
        now,
      );
    case FAILING_TEST_REPRO_STEP_NAME:
      return new FailingTestReproStepExecutionEntity(
        pipelineId,
        "queued",
        idempotencyKey,
        null,
        now,
      );
    case FAILING_TEST_FIX_STEP_NAME:
      return new FailingTestFixStepExecutionEntity(
        pipelineId,
        "queued",
        idempotencyKey,
        null,
        now,
      );
    default:
      throw httpError(`Unsupported pipeline step '${stepName}'`, 400);
  }
}

export async function advancePipeline(
  pipelineRunId: string,
  {
    pipelineRunRepo,
    stepExecutionRepo,
  }: {
    pipelineRunRepo: PipelineRunRepo;
    stepExecutionRepo: StepExecutionRepo;
  } = AppContext,
): Promise<PipelineRunContract> {
  const pipelineRun = await pipelineRunRepo.loadById(pipelineRunId, {
    includePipelineSteps: true,
  });
  if (!pipelineRun) {
    throw httpError(`Pipeline run with ID ${pipelineRunId} not found`, 404);
  }

  if (pipelineRun.pipelineSteps?.length === 0) {
    throw httpError(`Pipeline run with ID ${pipelineRunId} has no steps`, 400);
  }

  const lastSavedStep =
    [...(pipelineRun.pipelineSteps ?? [])].sort((a, b) => {
      const startedAtDiff = Date.parse(b.startedAt) - Date.parse(a.startedAt);
      if (startedAtDiff !== 0) {
        return startedAtDiff;
      }

      return String(b.id).localeCompare(String(a.id));
    })[0] ?? null;

  if (!lastSavedStep) {
    throw httpError(`Pipeline run with ID ${pipelineRunId} has no steps`, 400);
  }

  // todo: make pipeline more flexible
  if (lastSavedStep.status !== "succeeded") {
    throw httpError(
      `Latest step execution with ID ${lastSavedStep.id} is not completed for pipeline run ${pipelineRunId}`,
      400,
    );
  }

  const currentStepIndex = PIPELINE_STEP_SEQUENCE.indexOf(
    lastSavedStep.stepName,
  );
  if (currentStepIndex === -1) {
    throw httpError(
      `Step '${lastSavedStep.stepName}' is not part of the pipeline sequence`,
      400,
    );
  }

  const nextStepName = PIPELINE_STEP_SEQUENCE[currentStepIndex + 1];

  if (!nextStepName) {
    return pipelineRunEntityToContract(pipelineRun);
  }

  await stepExecutionRepo.save(
    buildQueuedStepExecution(pipelineRun.id, nextStepName),
  );
  const refreshedPipelineRun = await pipelineRunRepo.loadById(pipelineRun.id, {
    includePipelineSteps: true,
  });

  if (!refreshedPipelineRun) {
    throw httpError(`Pipeline run with ID ${pipelineRunId} not found`, 404);
  }

  return pipelineRunEntityToContract(refreshedPipelineRun);
}
