import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pipelineRuns } from "@/lib/db/schema";
import type { DbExecutor } from "@/lib/db/db-executor";
import type {
  LoadPipelineRunByIdOptions,
  LoadPipelineRunsByTicketIdsOptions,
  PipelineRunRepo,
} from "@/modules/pipeline-runs/application/pipeline-run-repo";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";

export class DrizzlePipelineRunRepo implements PipelineRunRepo {
  private readonly stepExecutionRepo = new DrizzleStepExecutionRepo();

  private toEntity(row: typeof pipelineRuns.$inferSelect): PipelineRunEntity {
    return new PipelineRunEntity(row.id, row.ticketId);
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
      stepExecutions,
    );
  }

  async loadByTicketId(ticketId: string): Promise<PipelineRunEntity[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.ticketId, ticketId))
      .orderBy(desc(pipelineRuns.id));

    return rows.map((row) => this.toEntity(row));
  }

  async loadByTicketIds(
    ticketIds: string[],
    options?: LoadPipelineRunsByTicketIdsOptions,
  ): Promise<Map<string, PipelineRunEntity[]>> {
    if (ticketIds.length === 0) {
      return new Map();
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(pipelineRuns)
      .where(inArray(pipelineRuns.ticketId, ticketIds))
      .orderBy(desc(pipelineRuns.id));

    const pipelineRunsByTicketId = new Map<string, PipelineRunEntity[]>();
    if (rows.length === 0) {
      return pipelineRunsByTicketId;
    }

    const pipelineRunsWithStepsById = new Map<string, PipelineRunEntity>();
    if (options?.includePipelineSteps) {
      const pipelineIds = rows.map((row) => row.id);
      const stepExecutionsByPipelineId =
        await this.stepExecutionRepo.loadByPipelineIds(pipelineIds);

      for (const row of rows) {
        const pipelineRun = this.toEntity(row);
        pipelineRunsWithStepsById.set(
          row.id,
          new PipelineRunEntity(
            pipelineRun.id,
            pipelineRun.ticketId,
            stepExecutionsByPipelineId.get(row.id) ?? [],
          ),
        );
      }
    }

    for (const row of rows) {
      const pipelineRun =
        pipelineRunsWithStepsById.get(row.id) ?? this.toEntity(row);
      const existing = pipelineRunsByTicketId.get(row.ticketId);
      if (existing) {
        existing.push(pipelineRun);
      } else {
        pipelineRunsByTicketId.set(row.ticketId, [pipelineRun]);
      }
    }

    return pipelineRunsByTicketId;
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
    }));

    const result = await db
      .insert(pipelineRuns)
      .values(rows)
      .onConflictDoUpdate({
        target: pipelineRuns.id,
        set: {
          ticketId: sql`excluded.ticket_id`,
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
