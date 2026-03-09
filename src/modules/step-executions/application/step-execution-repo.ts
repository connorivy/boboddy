import type { PipelineStepExecutionsQuery } from "@/modules/step-executions/contracts/get-pipeline-step-executions-contracts";
import type { DbExecutor } from "@/lib/db/db-executor";
import { TicketPipelineStepExecutionEntity } from "../domain/step-execution-entity";

export interface StepExecutionRepo {
  load(id: string): Promise<TicketPipelineStepExecutionEntity | null>;
  loadQueued(limit: number): Promise<TicketPipelineStepExecutionEntity[]>;
  claimQueued(id: string): Promise<TicketPipelineStepExecutionEntity | null>;
  loadByPipelineId(
    pipelineId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]>;
  loadByTicketId(
    ticketId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]>;
  getByTicketId(
    ticketId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]>;
  loadPage(
    query: PipelineStepExecutionsQuery,
  ): Promise<TicketPipelineStepExecutionEntity[]>;
  count(): Promise<number>;
  save(
    stepExecution: TicketPipelineStepExecutionEntity,
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity>;
  saveMany(
    stepExecutions: TicketPipelineStepExecutionEntity[],
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity[]>;
}
