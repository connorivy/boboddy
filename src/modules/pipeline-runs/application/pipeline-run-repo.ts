import type { DbExecutor } from "@/lib/db/db-executor";
import { PipelineRunAggregate } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";

export interface PipelineRunRepo {
  save(
    pipelineRun: PipelineRunAggregate,
    dbExecutor?: DbExecutor,
  ): Promise<PipelineRunAggregate>;
}
