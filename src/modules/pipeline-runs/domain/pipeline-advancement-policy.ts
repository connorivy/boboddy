import { httpError } from "@/lib/api/http";
import type { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import {
  FailingTestFixStepExecutionEntity,
  FinalizeFailingTestReproPrStepExecutionEntity,
  FailingTestReproStepExecutionEntity,
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionQualityStepExecutionEntity,
  TicketDuplicateCandidatesStepResultEntity,
  type TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
  type StepExecutionStepName,
} from "@/modules/step-executions/domain/step-execution.types";

const PIPELINE_STEP_SEQUENCE: ReadonlyArray<StepExecutionStepName> = [
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  // TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME,
  FAILING_TEST_FIX_STEP_NAME,
];

const DESCRIPTION_QUALITY_ADVANCEMENT_THRESHOLD = 0.6;
const DUPLICATE_CONFIDENCE_BLOCK_THRESHOLD = 0.85;
const REPRO_CONFIDENCE_ADVANCEMENT_THRESHOLD = 0.85;

export class PipelineAdvancementPolicy {
  createNextStepExecution(
    pipelineRun: PipelineRunEntity,
  ): TicketPipelineStepExecutionEntity | null {
    const latestStepExecution = this.getLatestStepExecution(pipelineRun);
    if (!this.shouldAdvance(latestStepExecution, pipelineRun)) {
      return null;
    }

    const nextStepName = this.getNextStepName(latestStepExecution, pipelineRun);
    if (!nextStepName) {
      return null;
    }

    return this.buildQueuedStepExecution(
      pipelineRun.id,
      pipelineRun.ticketId,
      nextStepName,
    );
  }

  protected getLatestStepExecution(
    pipelineRun: PipelineRunEntity,
  ): TicketPipelineStepExecutionEntity {
    if (pipelineRun.pipelineSteps?.length === 0) {
      throw httpError(
        `Pipeline run with ID ${pipelineRun.id} has no steps`,
        400,
      );
    }

    const latestStepExecution =
      [...(pipelineRun.pipelineSteps ?? [])].sort((a, b) => {
        const startedAtDiff = Date.parse(b.startedAt) - Date.parse(a.startedAt);
        if (startedAtDiff !== 0) {
          return startedAtDiff;
        }

        return String(b.id).localeCompare(String(a.id));
      })[0] ?? null;

    if (!latestStepExecution) {
      throw httpError(
        `Pipeline run with ID ${pipelineRun.id} has no steps`,
        400,
      );
    }

    return latestStepExecution;
  }

  protected shouldAdvance(
    latestStepExecution: TicketPipelineStepExecutionEntity,
    _pipelineRun: PipelineRunEntity,
  ): boolean {
    if (latestStepExecution.status !== "succeeded") {
      return false;
    }

    switch (latestStepExecution.stepName) {
      case TICKET_DESCRIPTION_QUALITY_STEP_NAME: {
        if (
          !(
            latestStepExecution instanceof
            TicketDescriptionQualityStepExecutionEntity
          )
        ) {
          return false;
        }

        const result = latestStepExecution.result;
        if (!result) {
          return false;
        }

        const averageQualityScore =
          (result.stepsToReproduceScore +
            result.expectedBehaviorScore +
            result.observedBehaviorScore) /
          3;

        return averageQualityScore >= DESCRIPTION_QUALITY_ADVANCEMENT_THRESHOLD;
      }
      case TICKET_DUPLICATE_CANDIDATES_STEP_NAME: {
        if (
          !(
            latestStepExecution instanceof
            TicketDuplicateCandidatesStepResultEntity
          )
        ) {
          return false;
        }

        const result = latestStepExecution.result;
        if (!result) {
          return false;
        }

        const topDuplicateScore = Math.max(
          0,
          ...result.proposed.map((candidate) => candidate.score),
          ...result.promoted.map((candidate) => candidate.score),
        );

        return topDuplicateScore < DUPLICATE_CONFIDENCE_BLOCK_THRESHOLD;
      }
      case TICKET_INVESTIGATION_STEP_NAME:
        return (
          latestStepExecution instanceof
          TicketDescriptionEnrichmentStepExecutionEntity
        );
      case FAILING_TEST_REPRO_STEP_NAME: {
        if (
          !(latestStepExecution instanceof FailingTestReproStepExecutionEntity)
        ) {
          return false;
        }

        const result = latestStepExecution.result;
        if (
          !result ||
          !("confidenceLevel" in result) ||
          typeof result.confidenceLevel !== "number"
        ) {
          return false;
        }

        return result.confidenceLevel >= REPRO_CONFIDENCE_ADVANCEMENT_THRESHOLD;
      }
      case FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME:
        return (
          latestStepExecution instanceof
            FinalizeFailingTestReproPrStepExecutionEntity &&
          latestStepExecution.result?.githubMergeStatus === "merged"
        );
      case FAILING_TEST_FIX_STEP_NAME:
        return latestStepExecution instanceof FailingTestFixStepExecutionEntity;
      default:
        return true;
    }
  }

  protected getNextStepName(
    latestStepExecution: TicketPipelineStepExecutionEntity,
    _pipelineRun: PipelineRunEntity,
  ): StepExecutionStepName | null {
    const currentStepIndex = PIPELINE_STEP_SEQUENCE.indexOf(
      latestStepExecution.stepName,
    );
    if (currentStepIndex === -1) {
      throw httpError(
        `Step '${latestStepExecution.stepName}' is not part of the pipeline sequence`,
        400,
      );
    }

    return PIPELINE_STEP_SEQUENCE[currentStepIndex + 1] ?? null;
  }

  protected buildQueuedStepExecution(
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
      case FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME:
        return new FinalizeFailingTestReproPrStepExecutionEntity(
          pipelineId,
          ticketId,
          "queued",
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
}
