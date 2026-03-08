import type { DbExecutor } from "@/lib/db/db-executor";
import { PipelineRunEntity } from "../domain/pipeline-run-aggregate";

export type LoadPipelineRunByIdOptions = {
  includePipelineSteps?: boolean;
};

export type LoadPipelineRunsByTicketIdsOptions = {
  includePipelineSteps?: boolean;
};

export type PipelineRunRepo = {
  loadById(
    pipelineRunId: string,
    options?: LoadPipelineRunByIdOptions,
  ): Promise<PipelineRunEntity | null>;
  loadByTicketId(ticketId: string): Promise<PipelineRunEntity[]>;
  loadByTicketIds(
    ticketIds: string[],
    options?: LoadPipelineRunsByTicketIdsOptions,
  ): Promise<Map<string, PipelineRunEntity[]>>;
  createMany(
    pipelineRuns: PipelineRunEntity[],
    dbExecutor?: DbExecutor,
  ): Promise<PipelineRunEntity[]>;
  save(
    pipelineRun: PipelineRunEntity,
    dbExecutor?: DbExecutor,
  ): Promise<PipelineRunEntity>;
};
