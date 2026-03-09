import { AppContext } from "@/lib/di";
import { type PipelineRunContract } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { pipelineRunEntityToContract } from "./pipeline-run-entity-to-contract";
import type { PipelineRunRepo } from "./pipeline-run-repo";
import { httpError } from "@/lib/api/http";
import { PipelineAdvancementPolicy } from "../domain/pipeline-advancement-policy";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
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

function buildQueuedStepExecution(
  pipelineId: string,
  ticketId: string,
  stepName: StepExecutionStepName,
): TicketPipelineStepExecutionEntity {
  const now = new Date().toISOString();

  switch (stepName) {
    case TICKET_DESCRIPTION_QUALITY_STEP_NAME:
      return new TicketDescriptionQualityStepExecutionEntity(
        pipelineId,
        ticketId,
        "queued",
        null,
        now,
      );
    case TICKET_INVESTIGATION_STEP_NAME:
      return new TicketDescriptionEnrichmentStepExecutionEntity(
        pipelineId,
        ticketId,
        "queued",
        null,
        now,
      );
    case TICKET_DUPLICATE_CANDIDATES_STEP_NAME:
      return new TicketDuplicateCandidatesStepResultEntity(
        pipelineId,
        ticketId,
        "queued",
        null,
        now,
      );
    case FAILING_TEST_REPRO_STEP_NAME:
      return new FailingTestReproStepExecutionEntity(
        pipelineId,
        ticketId,
        "queued",
        null,
        null,
        now,
      );
    case FAILING_TEST_FIX_STEP_NAME:
      return new FailingTestFixStepExecutionEntity(
        pipelineId,
        ticketId,
        "queued",
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
    pipelineAdvancementPolicy,
    pipelineRunRepo,
    stepExecutionRepo,
  }: {
    pipelineAdvancementPolicy: PipelineAdvancementPolicy;
    pipelineRunRepo: PipelineRunRepo;
    stepExecutionRepo: StepExecutionRepo;
  } = {
    pipelineAdvancementPolicy: new PipelineAdvancementPolicy(),
    ...AppContext,
  },
): Promise<PipelineRunContract> {
  const pipelineRun = await pipelineRunRepo.loadById(pipelineRunId, {
    includePipelineSteps: true,
  });
  if (!pipelineRun) {
    throw httpError(`Pipeline run with ID ${pipelineRunId} not found`, 404);
  }

  const decision = pipelineAdvancementPolicy.decideNextAction(pipelineRun);

  if (decision.kind === "complete") {
    return pipelineRunEntityToContract(pipelineRun);
  }

  await stepExecutionRepo.save(
    buildQueuedStepExecution(
      pipelineRun.id,
      pipelineRun.ticketId,
      decision.stepName,
    ),
  );
  const refreshedPipelineRun = await pipelineRunRepo.loadById(pipelineRun.id, {
    includePipelineSteps: true,
  });

  if (!refreshedPipelineRun) {
    throw httpError(`Pipeline run with ID ${pipelineRunId} not found`, 404);
  }

  return pipelineRunEntityToContract(refreshedPipelineRun);
}
