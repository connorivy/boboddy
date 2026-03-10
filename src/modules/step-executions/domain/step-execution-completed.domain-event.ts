import type { DomainEvent } from "@/lib/domain-events/domain-event";
import type {
  StepExecutionStatus,
  StepExecutionStepName,
} from "@/modules/step-executions/domain/step-execution.types";

export const STEP_EXECUTION_COMPLETED_DOMAIN_EVENT_TYPE =
  "step_execution.completed";

export type StepExecutionCompletedDomainEventPayload = {
  stepExecutionId: string;
  pipelineId: string | null;
  ticketId: string;
  stepName: StepExecutionStepName;
  status: StepExecutionStatus;
  startedAt: Date;
  endedAt: Date;
};

export class StepExecutionCompletedDomainEvent
  implements
    DomainEvent<
      typeof STEP_EXECUTION_COMPLETED_DOMAIN_EVENT_TYPE,
      StepExecutionCompletedDomainEventPayload
    >
{
  readonly type = STEP_EXECUTION_COMPLETED_DOMAIN_EVENT_TYPE;
  readonly occurredAt: Date;

  constructor(
    readonly payload: StepExecutionCompletedDomainEventPayload,
    occurredAt = payload.endedAt,
  ) {
    this.occurredAt = occurredAt;
  }
}
