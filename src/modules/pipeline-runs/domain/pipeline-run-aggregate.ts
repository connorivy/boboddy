import {
  TicketDescriptionQualityStepExecutionEntity,
  TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import { v7 as uuidv7 } from "uuid";

export class PipelineRunEntity {
  constructor(
    public id: string,
    public ticketId: string,
    public readonly pipelineSteps?: TicketPipelineStepExecutionEntity[],
  ) {}

  static createAndQueueFirstStep({
    ticketId,
    queuedAt,
  }: {
    ticketId: string;
    queuedAt: Date;
  }): PipelineRunEntity {
    const id = uuidv7();
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
