import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pipelineRuns } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/db-executor";
import type {
  LoadPipelineRunByIdOptions,
  PipelineRunRepo,
} from "@/modules/pipeline-runs/application/pipeline-run-repo";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";

export class DrizzlePipelineRunRepo implements PipelineRunRepo {
  private readonly stepExecutionRepo = new DrizzleStepExecutionRepo();

  private toEntity(row: typeof pipelineRuns.$inferSelect): PipelineRunEntity {
    return new PipelineRunEntity(
      row.id,
      row.ticketId,
      row.status,
      row.currentStepName,
      row.currentStepExecutionId,
      row.lastCompletedStepName,
      row.haltReason,
      row.startedAt,
      row.endedAt,
      row.createdAt,
      row.updatedAt,
    );
  }

  async loadById(
    pipelineRunId: string,
    options?: LoadPipelineRunByIdOptions,
  ): Promise<PipelineRunEntity | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, pipelineRunId))
      .limit(1);

    if (!row) {
      return null;
    }

    const pipelineRun = this.toEntity(row);
    if (!options?.includePipelineSteps) {
      return pipelineRun;
    }

    const stepExecutions = await this.stepExecutionRepo.loadByPipelineId(
      pipelineRun.id,
    );

    return new PipelineRunEntity(
      pipelineRun.id,
      pipelineRun.ticketId,
      pipelineRun.status,
      pipelineRun.currentStepName,
      pipelineRun.currentStepExecutionId,
      pipelineRun.lastCompletedStepName,
      pipelineRun.haltReason,
      pipelineRun.startedAt,
      pipelineRun.endedAt,
      pipelineRun.createdAt,
      pipelineRun.updatedAt,
      stepExecutions,
    );
  }

  async loadByTicketId(ticketId: string): Promise<PipelineRunEntity[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.ticketId, ticketId))
      .orderBy(desc(pipelineRuns.startedAt), desc(pipelineRuns.createdAt));

    return rows.map((row) => this.toEntity(row));
  }

  async createMany(
    pipelineRunsInput: PipelineRunEntity[],
    dbExecutor?: DbExecutor,
  ): Promise<PipelineRunEntity[]> {
    if (pipelineRunsInput.length === 0) {
      return [];
    }

    const db = dbExecutor ?? getDb();
    const rows = pipelineRunsInput.map((pipelineRun) => ({
      id: pipelineRun.id,
      ticketId: pipelineRun.ticketId,
      status: pipelineRun.status,
      currentStepName: pipelineRun.currentStepName,
      currentStepExecutionId: pipelineRun.currentStepExecutionId,
      lastCompletedStepName: pipelineRun.lastCompletedStepName,
      haltReason: pipelineRun.haltReason,
      startedAt: pipelineRun.startedAt,
      endedAt: pipelineRun.endedAt,
      createdAt: pipelineRun.createdAt,
      updatedAt: pipelineRun.updatedAt,
    }));

    const result = await db
      .insert(pipelineRuns)
      .values(rows)
      .onConflictDoUpdate({
        target: pipelineRuns.id,
        set: {
          ticketId: sql`excluded.ticket_id`,
          status: sql`excluded.status`,
          currentStepName: sql`excluded.current_step_name`,
          currentStepExecutionId: sql`excluded.current_step_execution_id`,
          lastCompletedStepName: sql`excluded.last_completed_step_name`,
          haltReason: sql`excluded.halt_reason`,
          startedAt: sql`excluded.started_at`,
          endedAt: sql`excluded.ended_at`,
          createdAt: sql`excluded.created_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning();

    return result.map(this.toEntity);
  }

  async save(
    pipelineRun: PipelineRunEntity,
    dbExecutor?: DbExecutor,
  ): Promise<PipelineRunEntity> {
    const [row] = await this.createMany([pipelineRun], dbExecutor);

    if (!row) {
      throw new Error(`Failed to save pipeline run ${pipelineRun.id}`);
    }

    return row;
  }
}
