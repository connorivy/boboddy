import type { PipelineStepExecutionsQuery } from "@/modules/step-executions/contracts/get-pipeline-step-executions-contracts";
import { TicketPipelineStepExecutionEntity } from "../domain/step-execution-entity";

export interface StepExecutionRepo {
  load(id: number): Promise<TicketPipelineStepExecutionEntity | null>;
  loadByPipelineRunId(
    pipelineRunId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]>;
  loadByTicketId(
    ticketId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]>;
  loadPage(
    query: PipelineStepExecutionsQuery,
  ): Promise<TicketPipelineStepExecutionEntity[]>;
  count(): Promise<number>;
  save(
    stepExecution: TicketPipelineStepExecutionEntity,
  ): Promise<TicketPipelineStepExecutionEntity>;
}
