import type { DbExecutor } from "@/lib/db/db-executor";
import { PipelineRunEntity } from "../domain/pipeline-run-aggregate";

export type PipelineRunRepo = {
  loadById(pipelineRunId: string): Promise<PipelineRunEntity | null>;
  loadByTicketId(ticketId: string): Promise<PipelineRunEntity[]>;
  createMany(
    pipelineRuns: PipelineRunEntity[],
    dbExecutor?: DbExecutor,
  ): Promise<PipelineRunEntity[]>;
  save(
    pipelineRun: PipelineRunEntity,
    dbExecutor?: DbExecutor,
  ): Promise<PipelineRunEntity>;
};
