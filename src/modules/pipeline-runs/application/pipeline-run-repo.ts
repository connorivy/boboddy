import type { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import type { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-entity";

export interface PipelineRunRepo {
  load(id: string): Promise<PipelineRunEntity | null>;
  loadLatestOrActiveByTicketId(ticketId: string): Promise<PipelineRunEntity | null>;
  loadPage(query: { page: number; pageSize: number }): Promise<PipelineRunEntity[]>;
  count(): Promise<number>;
  loadExecutions(
    pipelineRunId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]>;
  save(run: PipelineRunEntity): Promise<PipelineRunEntity>;
}
