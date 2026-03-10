import { httpError } from "@/lib/api/http";
import { appTimeProvider } from "@/lib/time-provider";
import type { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import {
  type TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  getStepExecutionDefinition,
} from "@/modules/step-executions/domain/step-execution-registry";
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
    pipelineRun: PipelineRunEntity,
  ): boolean {
    const definition = getStepExecutionDefinition(latestStepExecution.stepName);
    return definition.shouldAdvance(latestStepExecution as never, pipelineRun);
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
    return getStepExecutionDefinition(stepName).createQueuedExecution({
      pipelineId,
      ticketId,
      now: appTimeProvider.current.nowIso(),
    });
  }
}
