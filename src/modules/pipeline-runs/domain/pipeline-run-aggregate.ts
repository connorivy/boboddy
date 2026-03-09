import {
  TicketDescriptionQualityStepExecutionEntity,
  TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";

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
      ticketId,
      "queued",
      null,
      queuedAt.toISOString(),
    );

    return new PipelineRunEntity(id, ticketId, [firstStep]);
  }
}
