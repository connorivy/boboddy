import { randomUUID } from "node:crypto";
import {
  TicketDescriptionQualityStepExecutionEntity,
  TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  StepExecutionStepName,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { v7 as uuidv7 } from "uuid";

export type CreatePipelineRunEntityArgs = {
  id: string;
  ticketId: string;
  status: PipelineRunStatus;
  currentStepName?: StepExecutionStepName | null;
  currentStepExecutionId?: string | null;
  lastCompletedStepName?: StepExecutionStepName | null;
  haltReason?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class PipelineRunEntity {
  constructor(
    public id: string,
    public ticketId: string,
    public status: PipelineRunStatus,
    public currentStepName: StepExecutionStepName | null,
    public currentStepExecutionId: string | null,
    public lastCompletedStepName: StepExecutionStepName | null,
    public haltReason: string | null,
    public startedAt: Date,
    public endedAt: Date | null = null,
    public createdAt: Date,
    public updatedAt: Date,
    public readonly pipelineSteps?: TicketPipelineStepExecutionEntity[],
  ) {}

  static createAndQueueFirstStep({
    ticketId,
    status,
    createdAt,
  }: CreatePipelineRunEntityArgs): PipelineRunEntity {
    const pipelineId = uuidv7();
    const firstStep = new TicketDescriptionQualityStepExecutionEntity(
      pipelineId,
      "queued",
      `${TICKET_DESCRIPTION_QUALITY_STEP_NAME}:${pipelineId}:${randomUUID()}`,
      null,
      createdAt.toISOString(),
    );

    return new PipelineRunEntity(
      pipelineId,
      ticketId,
      status,
      firstStep.stepName,
      firstStep.id,
      null,
      null,
      createdAt,
      null,
      createdAt,
      createdAt,
      [firstStep],
    );
  }
}

export const PIPELINE_RUN_STATUSES = [
  "queued",
  "running",
  "waiting",
  "halted",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUSES)[number];
