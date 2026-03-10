import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { DbExecutor } from "@/lib/db/db-executor";
import { pipelineRuns, ticketStepExecutionsTph } from "@/lib/db/schema";
import type { InProcessDomainEventBus } from "@/lib/domain-events/in-process-domain-event-bus";
import { appTimeProvider } from "@/lib/time-provider";
import type { PipelineStepExecutionsQuery } from "@/modules/step-executions/contracts/get-pipeline-step-executions-contracts";
import {
  getStepExecutionDefinition,
  getStepExecutionDefinitionForExecution,
  parseIsoDateOrThrow,
} from "@/modules/step-executions/domain/step-execution-registry";
import { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import { StepExecutionRepo } from "../application/step-execution-repo";

export class DrizzleStepExecutionRepo implements StepExecutionRepo {
  constructor(
    private readonly domainEventBus: InProcessDomainEventBus | null = null,
  ) {}

  private mapRowToExecution(
    row: typeof ticketStepExecutionsTph.$inferSelect,
    ticketId: string = row.ticketId,
  ): TicketPipelineStepExecutionEntity {
    if (row.type !== row.stepName) {
      throw new Error(
        `Corrupt step execution row ${row.id}: stepName '${row.stepName}' does not match type '${row.type}'`,
      );
    }

    return getStepExecutionDefinition(row.type).deserializeExecution(row, ticketId);
  }

  async load(id: string): Promise<TicketPipelineStepExecutionEntity | null> {
    const db = getDb();

    const [row] = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(eq(ticketStepExecutionsTph.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapRowToExecution(row);
  }

  async loadQueued(
    limit: number,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    const db = getDb();
    const safeLimit = Math.max(1, Math.min(limit, 100));

    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(eq(ticketStepExecutionsTph.status, "queued"))
      .orderBy(
        asc(ticketStepExecutionsTph.startedAt),
        asc(ticketStepExecutionsTph.id),
      )
      .limit(safeLimit);

    return rows.map((row) => this.mapRowToExecution(row));
  }

  async claimQueued(
    id: string,
  ): Promise<TicketPipelineStepExecutionEntity | null> {
    const db = getDb();
    const now = appTimeProvider.current.now();

    const [row] = await db
      .update(ticketStepExecutionsTph)
      .set({
        status: "running",
        updatedAt: now,
        endedAt: null,
      })
      .where(
        and(
          eq(ticketStepExecutionsTph.id, id),
          eq(ticketStepExecutionsTph.status, "queued"),
        ),
      )
      .returning();

    if (!row) {
      return null;
    }

    return this.mapRowToExecution(row);
  }

  async loadByPipelineId(
    pipelineId: string,
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    const db = dbExecutor ?? getDb();

    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(eq(ticketStepExecutionsTph.pipelineId, pipelineId))
      .orderBy(
        desc(ticketStepExecutionsTph.startedAt),
        desc(ticketStepExecutionsTph.id),
      );

    return rows.map((row) => this.mapRowToExecution(row));
  }

  async loadByPipelineIds(
    pipelineIds: string[],
  ): Promise<Map<string, TicketPipelineStepExecutionEntity[]>> {
    if (pipelineIds.length === 0) {
      return new Map();
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(inArray(ticketStepExecutionsTph.pipelineId, pipelineIds))
      .orderBy(
        desc(ticketStepExecutionsTph.startedAt),
        desc(ticketStepExecutionsTph.id),
      );

    const stepExecutionsByPipelineId = new Map<
      string,
      TicketPipelineStepExecutionEntity[]
    >();

    for (const row of rows) {
      if (!row.pipelineId) {
        continue;
      }

      const execution = this.mapRowToExecution(row);
      const executions = stepExecutionsByPipelineId.get(row.pipelineId);
      if (executions) {
        executions.push(execution);
      } else {
        stepExecutionsByPipelineId.set(row.pipelineId, [execution]);
      }
    }

    return stepExecutionsByPipelineId;
  }

  async loadByTicketId(
    ticketId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.getByTicketId(ticketId);
  }

  async getByTicketId(
    ticketId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    const db = getDb();

    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(eq(ticketStepExecutionsTph.ticketId, ticketId))
      .orderBy(
        desc(ticketStepExecutionsTph.startedAt),
        desc(ticketStepExecutionsTph.id),
      );

    return rows.map((row) => this.mapRowToExecution(row, ticketId));
  }

  async loadPage(
    query: PipelineStepExecutionsQuery,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    const db = getDb();

    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .orderBy(
        desc(ticketStepExecutionsTph.startedAt),
        desc(ticketStepExecutionsTph.id),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return rows.map((row) => this.mapRowToExecution(row));
  }

  async count(): Promise<number> {
    const db = getDb();

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ticketStepExecutionsTph);

    return Number(result?.count ?? 0);
  }

  private async saveStepExecution(
    tx: DbExecutor,
    pipeline: TicketPipelineStepExecutionEntity,
    startedAt: Date,
    endedAt: Date | null,
    now: Date,
  ): Promise<TicketPipelineStepExecutionEntity> {
    const definition = getStepExecutionDefinitionForExecution(pipeline);
    const fields = definition.serializeExecution({
      execution: pipeline as never,
      endedAt,
      now,
    });

    const [updated] = await tx
      .update(ticketStepExecutionsTph)
      .set({
        pipelineId: pipeline.pipelineId,
        ticketId: pipeline.ticketId,
        stepName: pipeline.stepName,
        type: pipeline.stepName,
        status: pipeline.status,
        startedAt,
        endedAt,
        updatedAt: now,
        failureReason: pipeline.failureReason,
        ...fields,
      })
      .where(eq(ticketStepExecutionsTph.id, pipeline.id))
      .returning({
        id: ticketStepExecutionsTph.id,
        createdAt: ticketStepExecutionsTph.createdAt,
        updatedAt: ticketStepExecutionsTph.updatedAt,
      });

    if (updated) {
      pipeline.id = updated.id;
      pipeline.createdAt = updated.createdAt.toISOString();
      pipeline.updatedAt = updated.updatedAt.toISOString();
      return pipeline;
    }

    const [inserted] = await tx
      .insert(ticketStepExecutionsTph)
      .values({
        id: pipeline.id,
        pipelineId: pipeline.pipelineId,
        ticketId: pipeline.ticketId,
        stepName: pipeline.stepName,
        type: pipeline.stepName,
        status: pipeline.status,
        idempotencyKey: pipeline.id,
        startedAt,
        endedAt,
        createdAt: pipeline.createdAt
          ? parseIsoDateOrThrow(pipeline.createdAt, "createdAt")
          : now,
        updatedAt: now,
        failureReason: pipeline.failureReason,
        ...fields,
      })
      .returning({
        id: ticketStepExecutionsTph.id,
        createdAt: ticketStepExecutionsTph.createdAt,
        updatedAt: ticketStepExecutionsTph.updatedAt,
      });

    pipeline.id = inserted.id;
    pipeline.createdAt = inserted.createdAt.toISOString();
    pipeline.updatedAt = inserted.updatedAt.toISOString();
    return pipeline;
  }

  async save(
    pipeline: TicketPipelineStepExecutionEntity,
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity> {
    if (dbExecutor) {
      return this.saveInExecutor(pipeline, dbExecutor);
    }

    return getDb().transaction(async (tx) => this.saveInExecutor(pipeline, tx));
  }

  async saveMany(
    stepExecutions: TicketPipelineStepExecutionEntity[],
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    if (stepExecutions.length === 0) {
      return [];
    }

    if (dbExecutor) {
      const savedExecutions: TicketPipelineStepExecutionEntity[] = [];
      for (const stepExecution of stepExecutions) {
        savedExecutions.push(await this.saveInExecutor(stepExecution, dbExecutor));
      }

      return savedExecutions;
    }

    return getDb().transaction(async (tx) => {
      const savedExecutions: TicketPipelineStepExecutionEntity[] = [];
      for (const stepExecution of stepExecutions) {
        savedExecutions.push(await this.saveInExecutor(stepExecution, tx));
      }

      return savedExecutions;
    });
  }

  private async saveInExecutor(
    pipeline: TicketPipelineStepExecutionEntity,
    dbExecutor: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity> {
    const now = appTimeProvider.current.now();
    const startedAt = parseIsoDateOrThrow(pipeline.startedAt, "startedAt");
    const endedAt = pipeline.endedAt
      ? parseIsoDateOrThrow(pipeline.endedAt, "endedAt")
      : null;

    const savedExecution = await this.saveStepExecution(
      dbExecutor,
      pipeline,
      startedAt,
      endedAt,
      now,
    );

    const domainEvents = pipeline.pullDomainEvents();
    if (this.domainEventBus && domainEvents.length > 0) {
      await this.domainEventBus.publish(
        domainEvents,
        dbExecutor as Parameters<InProcessDomainEventBus["publish"]>[1],
      );
    }

    return savedExecution;
  }

  async findByGithubIssueNumber(
    githubIssueNumber: number,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    const rows = await getDb()
      .select({
        stepExecution: ticketStepExecutionsTph,
        ticketId: pipelineRuns.ticketId,
      })
      .from(ticketStepExecutionsTph)
      .leftJoin(
        pipelineRuns,
        eq(ticketStepExecutionsTph.pipelineId, pipelineRuns.id),
      )
      .where(eq(ticketStepExecutionsTph.githubIssueNumber, githubIssueNumber))
      .orderBy(
        desc(ticketStepExecutionsTph.startedAt),
        desc(ticketStepExecutionsTph.id),
      );

    return rows.map(({ stepExecution, ticketId }) =>
      this.mapRowToExecution(stepExecution, ticketId ?? stepExecution.ticketId),
    );
  }

  async findMostRecentByGithubIssueNumber(
    githubIssueNumber: number,
  ): Promise<TicketPipelineStepExecutionEntity | null> {
    const [execution] = await this.findByGithubIssueNumber(githubIssueNumber);
    return execution ?? null;
  }

  async findByGithubIssueNumberOrBranch(
    githubIssueNumber: number | null,
    agentBranch: string | null,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    if (githubIssueNumber === null && agentBranch === null) {
      return [];
    }

    const whereClauses = [];
    if (githubIssueNumber !== null) {
      whereClauses.push(
        eq(ticketStepExecutionsTph.githubIssueNumber, githubIssueNumber),
      );
    }
    if (agentBranch !== null) {
      whereClauses.push(eq(ticketStepExecutionsTph.agentBranch, agentBranch));
    }

    const rows = await getDb()
      .select()
      .from(ticketStepExecutionsTph)
      .where(or(...whereClauses))
      .orderBy(
        desc(ticketStepExecutionsTph.startedAt),
        desc(ticketStepExecutionsTph.id),
      );

    return rows.map((row) => this.mapRowToExecution(row));
  }
}
