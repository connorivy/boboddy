import { getDb } from "@/lib/db";
import { pipelineRuns } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/db-executor";
import type { PipelineRunRepo } from "@/modules/pipeline-runs/application/pipeline-run-repo";
import { PipelineRunAggregate } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";

const rowToAggregate = (
  row: typeof pipelineRuns.$inferSelect,
): PipelineRunAggregate =>
  PipelineRunAggregate.rehydrate({
    id: row.id,
    ticketId: row.ticketId,
    pipelineName: row.pipelineName,
    status: row.status,
    failureReason: row.failureReason ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export class DrizzlePipelineRunRepo implements PipelineRunRepo {
  async save(
    pipelineRun: PipelineRunAggregate,
    dbExecutor?: DbExecutor,
  ): Promise<PipelineRunAggregate> {
    if (pipelineRun.id) {
      throw new Error(
        "Pipeline run already has an ID. Use this repo only to create new pipeline runs.",
      );
    }

    const db = dbExecutor ?? getDb();
    const [saved] = await db
      .insert(pipelineRuns)
      .values({
        ticketId: pipelineRun.ticketId,
        pipelineName: pipelineRun.pipelineName,
        status: pipelineRun.status,
        failureReason: pipelineRun.failureReason ?? null,
      })
      .returning();

    return rowToAggregate(saved);
  }
}
