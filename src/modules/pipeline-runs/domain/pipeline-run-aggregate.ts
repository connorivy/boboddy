import { randomUUID } from "node:crypto";
import {
  TicketDescriptionQualityStepExecutionEntity,
  TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";

export class PipelineRunEntity {
  constructor(
    public id: string,
    public ticketId: string,
    public readonly pipelineSteps?: TicketPipelineStepExecutionEntity[],
  ) {}

  static createAndQueueFirstStep({
    id,
    ticketId,
    queuedAt,
  }: {
    id: string;
    ticketId: string;
    queuedAt: Date;
  }): PipelineRunEntity {
    const firstStep = new TicketDescriptionQualityStepExecutionEntity(
      id,
      "queued",
      `${TICKET_DESCRIPTION_QUALITY_STEP_NAME}:${id}:${randomUUID()}`,
      null,
      queuedAt.toISOString(),
    );

    return new PipelineRunEntity(id, ticketId, [firstStep]);
  }
}
