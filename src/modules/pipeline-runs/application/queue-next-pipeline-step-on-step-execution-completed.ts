import type { DbTransaction } from "@/lib/db/db-executor";
import type { DomainEventHandler } from "@/lib/domain-events/domain-event";
import { PipelineAdvancementPolicy } from "@/modules/pipeline-runs/domain/pipeline-advancement-policy";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import type { StepExecutionCompletedDomainEvent } from "@/modules/step-executions/domain/step-execution-completed.domain-event";
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
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { PipelineRunRepo } from "./pipeline-run-repo";
import { httpError } from "@/lib/api/http";
import { systemTimeProvider } from "@/lib/time-provider";

export class QueueNextPipelineStepOnStepExecutionCompleted implements DomainEventHandler<StepExecutionCompletedDomainEvent> {
  constructor(
    private readonly stepExecutionRepo: StepExecutionRepo,
    private readonly pipelineRunRepo: PipelineRunRepo,
    private readonly pipelineAdvancementPolicy: PipelineAdvancementPolicy = new PipelineAdvancementPolicy(
      systemTimeProvider,
    ),
  ) {}

  async handle(
    event: StepExecutionCompletedDomainEvent,
    deps: { tx: DbTransaction },
  ): Promise<void> {
    const { pipelineId } = event.payload;
    if (!pipelineId) {
      return;
    }

    const pipelineRun = await this.pipelineRunRepo.loadById(
      pipelineId,
      { includePipelineSteps: true },
      deps.tx,
    );

    if (!pipelineRun) {
      throw httpError(
        `Pipeline run with ID ${pipelineId} not found for step execution completed event with ID ${event.payload.pipelineId}`,
        404,
      );
    }
    let nextStepExecution: TicketPipelineStepExecutionEntity | null;
    try {
      nextStepExecution =
        this.pipelineAdvancementPolicy.createNextStepExecution(pipelineRun);
    } catch (error) {
      if (event.payload.status !== "succeeded") {
        throw error;
      }

        nextStepExecution =
        this.pipelineAdvancementPolicy.createNextStepExecution(
          new PipelineRunEntity(
            pipelineRun.id,
            pipelineRun.ticketId,
            pipelineRun.autoAdvance,
            [this.buildCompletedExecutionFromEvent(event)],
          ),
        );
    }

    if (!nextStepExecution) {
      return;
    }

    await this.stepExecutionRepo.save(nextStepExecution, deps.tx);
  }

  private buildCompletedExecutionFromEvent(
    event: StepExecutionCompletedDomainEvent,
  ): TicketPipelineStepExecutionEntity {
    const {
      pipelineId,
      ticketId,
      stepName,
      status,
      startedAt,
      endedAt,
      stepExecutionId,
    } = event.payload;

    switch (stepName) {
      case TICKET_DESCRIPTION_QUALITY_STEP_NAME:
        return new TicketDescriptionQualityStepExecutionEntity(
          pipelineId,
          ticketId,
          status,
          null,
          startedAt,
          endedAt,
          undefined,
          undefined,
          stepExecutionId,
        );
      case TICKET_INVESTIGATION_STEP_NAME:
        return new TicketDescriptionEnrichmentStepExecutionEntity(
          pipelineId,
          ticketId,
          status,
          null,
          startedAt,
          endedAt,
          undefined,
          undefined,
          stepExecutionId,
        );
      case TICKET_DUPLICATE_CANDIDATES_STEP_NAME:
        return new TicketDuplicateCandidatesStepResultEntity(
          pipelineId,
          ticketId,
          status,
          null,
          startedAt,
          endedAt,
          undefined,
          undefined,
          stepExecutionId,
        );
      case FAILING_TEST_REPRO_STEP_NAME:
        return new FailingTestReproStepExecutionEntity(
          pipelineId,
          ticketId,
          status,
          null,
          null,
          startedAt,
          endedAt,
          undefined,
          undefined,
          stepExecutionId,
        );
      case FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME:
        return new FinalizeFailingTestReproPrStepExecutionEntity(
          pipelineId,
          ticketId,
          status,
          null,
          startedAt,
          endedAt,
          undefined,
          undefined,
          stepExecutionId,
        );
      case FAILING_TEST_FIX_STEP_NAME:
        return new FailingTestFixStepExecutionEntity(
          pipelineId,
          ticketId,
          status,
          null,
          startedAt,
          endedAt,
          undefined,
          undefined,
          stepExecutionId,
        );
      default:
        throw httpError(
          `Unsupported step execution '${stepName}' for pipeline advancement`,
          400,
        );
    }
  }
}
