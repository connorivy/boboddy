import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pipelineRuns } from "@/lib/db/schema";
import type { PipelineRunRepo } from "@/modules/pipeline-runs/application/pipeline-run-repo";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-entity";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";

const parseIsoDateOrThrow = (value: string, fieldName: string): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO date in '${fieldName}': ${value}`);
  }

  return parsed;
};

const toEntity = (row: typeof pipelineRuns.$inferSelect): PipelineRunEntity =>
  new PipelineRunEntity(
    row.id,
    row.ticketId,
    row.status,
    row.currentStepName,
    row.currentStepExecutionId,
    row.lastCompletedStepName,
    row.haltReason,
    row.startedAt.toISOString(),
    row.endedAt?.toISOString() ?? null,
    row.pipelineType,
    row.definitionVersion,
    row.createdAt.toISOString(),
    row.updatedAt.toISOString(),
  );

export class DrizzlePipelineRunRepo implements PipelineRunRepo {
  constructor(
    private readonly stepExecutionRepo = new DrizzleStepExecutionRepo(),
  ) {}

  async load(id: string): Promise<PipelineRunEntity | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, id))
      .limit(1);

    return row ? toEntity(row) : null;
  }

  async loadLatestOrActiveByTicketId(
    ticketId: string,
  ): Promise<PipelineRunEntity | null> {
    const db = getDb();

    const [row] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.ticketId, ticketId))
      .orderBy(
        sql`case when ${pipelineRuns.status} in ('queued', 'running', 'waiting', 'halted') then 0 else 1 end`,
        desc(pipelineRuns.startedAt),
        desc(pipelineRuns.createdAt),
      )
      .limit(1);

    if (!row || row.ticketId !== ticketId) {
      return null;
    }

    return toEntity(row);
  }

  async loadPage(query: {
    page: number;
    pageSize: number;
  }): Promise<PipelineRunEntity[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(pipelineRuns)
      .orderBy(desc(pipelineRuns.startedAt), desc(pipelineRuns.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return rows.map(toEntity);
  }

  async count(): Promise<number> {
    const db = getDb();
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(pipelineRuns);

    return Number(result?.count ?? 0);
  }

  async loadExecutions(pipelineRunId: string) {
    return this.stepExecutionRepo.loadByPipelineRunId(pipelineRunId);
  }

  async save(run: PipelineRunEntity): Promise<PipelineRunEntity> {
    const db = getDb();
    const now = new Date();
    const [saved] = await db
      .insert(pipelineRuns)
      .values({
        id: run.id,
        ticketId: run.ticketId,
        status: run.status,
        currentStepName: run.currentStepName,
        currentStepExecutionId: run.currentStepExecutionId,
        lastCompletedStepName: run.lastCompletedStepName,
        haltReason: run.haltReason,
        pipelineType: run.pipelineType,
        definitionVersion: run.definitionVersion,
        startedAt: parseIsoDateOrThrow(run.startedAt, "startedAt"),
        endedAt: run.endedAt ? parseIsoDateOrThrow(run.endedAt, "endedAt") : null,
        createdAt: run.createdAt
          ? parseIsoDateOrThrow(run.createdAt, "createdAt")
          : now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pipelineRuns.id,
        set: {
          status: run.status,
          currentStepName: run.currentStepName,
          currentStepExecutionId: run.currentStepExecutionId,
          lastCompletedStepName: run.lastCompletedStepName,
          haltReason: run.haltReason,
          pipelineType: run.pipelineType,
          definitionVersion: run.definitionVersion,
          startedAt: parseIsoDateOrThrow(run.startedAt, "startedAt"),
          endedAt: run.endedAt
            ? parseIsoDateOrThrow(run.endedAt, "endedAt")
            : null,
          updatedAt: now,
        },
      })
      .returning();

    return toEntity(saved);
  }
}
