import {
  TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import { getStepExecutionDefinition } from "@/modules/step-executions/domain/step-execution-registry";
import { TICKET_DESCRIPTION_QUALITY_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import { v7 as uuidv7 } from "uuid";

export class PipelineRunEntity {
  constructor(
    public id: string,
    public ticketId: string,
    public autoAdvance = true,
    public readonly pipelineSteps?: TicketPipelineStepExecutionEntity[],
  ) {}

  static createAndQueueFirstStep({
    ticketId,
    queuedAt,
    autoAdvance = true,
  }: {
    ticketId: string;
    queuedAt: Date;
    autoAdvance?: boolean;
  }): PipelineRunEntity {
    const id = uuidv7();
    const firstStep = getStepExecutionDefinition(
      TICKET_DESCRIPTION_QUALITY_STEP_NAME,
    ).createQueuedExecution({
      pipelineId: id,
      ticketId,
      now: queuedAt.toISOString(),
    });

    return new PipelineRunEntity(id, ticketId, autoAdvance, [firstStep]);
  }
}
