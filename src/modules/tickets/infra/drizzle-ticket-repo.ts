import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { TicketSearchQuery } from "@/modules/tickets/contracts/ticket-contracts";
import {
  ticketGitEnvironments,
  ticketGithubIssues,
  ticketStepExecutionsTph,
  tickets,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";
import { TICKET_DESCRIPTION_QUALITY_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import {
  LoadTicketsOptions,
  TicketRepo,
} from "../application/jira-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { TicketGithubIssueEntity } from "@/modules/tickets/domain/ticket-github-issue.entity";
import type { DbExecutor } from "@/lib/db/db-executor";
import { TicketGitEnvironmentAggregate } from "@/modules/environments/domain/ticket-git-environment-aggregate";

const toDateOrNull = (value: string | null) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const ticketSelectFields = {
  id: tickets.id,
  ticketNumber: tickets.ticketNumber,
  title: tickets.title,
  slackThread: tickets.slackThread,
  status: tickets.status,
  description: tickets.description,
  companyNames: tickets.companyNames,
  employeeEmails: tickets.employeeEmails,
  priority: tickets.priority,
  ticketType: tickets.ticketType,
  dueDate: tickets.dueDate,
  reporter: tickets.reporter,
  assignee: tickets.assignee,
  jiraCreatedAt: tickets.jiraCreatedAt,
  jiraUpdatedAt: tickets.jiraUpdatedAt,
  defaultGitEnvironmentId: tickets.defaultGitEnvironmentId,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
};

export class DrizzleTicketRepo implements TicketRepo {
  constructor(
    private readonly stepExecutionRepo = new DrizzleStepExecutionRepo(),
  ) {}

  private buildFilters(query: TicketSearchQuery) {
    const conditions = [];

    if (query.q) {
      const pattern = `%${query.q}%`;
      conditions.push(
        or(
          ilike(tickets.ticketNumber, pattern),
          ilike(tickets.title, pattern),
          ilike(tickets.description, pattern),
          ilike(tickets.reporter, pattern),
          ilike(tickets.assignee, pattern),
        ),
      );
    }

    if (query.status) {
      conditions.push(eq(tickets.status, query.status));
    }

    if (query.priority) {
      conditions.push(eq(tickets.priority, query.priority));
    }

    if (query.stepName && query.stepExecutionStatus) {
      const latestStepStatusSubquery = sql`(
        select tse.status
        from ${ticketStepExecutionsTph} as tse
        where tse.ticket_id = ${tickets.id}
          and tse.step_name = ${query.stepName}
        order by tse.started_at desc, tse.id desc
        limit 1
      )`;
      const latestStepStatusAsTextSubquery = sql`(${latestStepStatusSubquery})::text`;

      if (query.stepExecutionStatus === "not_started") {
        conditions.push(sql`(
          not exists (
            select 1
            from ${ticketStepExecutionsTph} as tse
            where tse.ticket_id = ${tickets.id}
              and tse.step_name = ${query.stepName}
          ) or ${latestStepStatusAsTextSubquery} = ${query.stepExecutionStatus}
        )`);
      } else {
        conditions.push(
          sql`${latestStepStatusAsTextSubquery} = ${query.stepExecutionStatus}`,
        );
      }
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private toTicketAggregate(
    row: typeof tickets.$inferSelect,
    githubIssue?: TicketGithubIssueEntity | null,
    ticketGitEnvironmentAggregate?: TicketGitEnvironmentAggregate | null,
  ): TicketAggregate {
    return TicketAggregate.rehydrate({
      ...row,
      jiraCreatedAt: row.jiraCreatedAt?.toISOString() ?? null,
      jiraUpdatedAt: row.jiraUpdatedAt?.toISOString() ?? null,
      defaultGitEnvironmentId: row.defaultGitEnvironmentId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      pipelineSteps: undefined,
      githubIssue,
      ticketGitEnvironmentAggregate,
    });
  }

  private async loadGithubIssuesByTicketIds(
    ticketIds: string[],
  ): Promise<Map<string, TicketGithubIssueEntity>> {
    if (ticketIds.length === 0) {
      return new Map();
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(ticketGithubIssues)
      .where(inArray(ticketGithubIssues.ticketId, ticketIds));

    return new Map(
      rows.map((row) => [
        row.ticketId,
        new TicketGithubIssueEntity(
          row.ticketId,
          row.githubIssueNumber,
          row.githubIssueId,
          row.id,
          row.createdAt.toISOString(),
          row.updatedAt.toISOString(),
        ),
      ]),
    );
  }

  private async loadTicketGitEnvironmentByIds(
    ticketGitEnvironmentIds: number[],
  ): Promise<Map<number, TicketGitEnvironmentAggregate>> {
    if (ticketGitEnvironmentIds.length === 0) {
      return new Map();
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(ticketGitEnvironments)
      .where(inArray(ticketGitEnvironments.id, ticketGitEnvironmentIds));

    return new Map(
      rows.map((row) => [
        row.id,
        new TicketGitEnvironmentAggregate(
          row.ticketId,
          row.baseEnvironmentId,
          row.devBranch,
          row.id,
        ),
      ]),
    );
  }

  async loadMostRecentlyModified(): Promise<TicketAggregate> {
    const db = getDb();
    const [row] = await db
      .select(ticketSelectFields)
      .from(tickets)
      .orderBy(desc(tickets.jiraUpdatedAt))
      .limit(1);

    if (!row) {
      throw new Error("No tickets found");
    }

    return this.toTicketAggregate(row);
  }

  async createMany(
    ticketEntities: TicketAggregate[],
  ): Promise<TicketAggregate[]> {
    const db = getDb();
    const now = new Date();
    const rows = ticketEntities.map((ticket) => {
      const row = ticket;
      return {
        id: row.id ?? row.ticketNumber,
        ticketNumber: row.ticketNumber,
        title: row.title,
        slackThread: row.slackThread,
        status: row.status,
        description: row.description,
        companyNames: row.companyNames,
        employeeEmails: row.employeeEmails,
        priority: row.priority,
        ticketType: row.ticketType,
        dueDate: row.dueDate,
        reporter: row.reporter,
        assignee: row.assignee,
        defaultGitEnvironmentId: row.defaultGitEnvironmentId ?? null,
        createdAt: row.createdAt ?? now,
        updatedAt: now,
        jiraCreatedAt: toDateOrNull(row.jiraCreatedAt),
        jiraUpdatedAt: toDateOrNull(row.jiraUpdatedAt),
      };
    });

    if (rows.length === 0) {
      return [];
    }

    const result = await db
      .insert(tickets)
      .values(rows)
      .onConflictDoUpdate({
        target: tickets.ticketNumber,
        set: {
          id: sql`excluded.id`,
          ticketNumber: sql`excluded.ticket_number`,
          title: sql`excluded.title`,
          slackThread: sql`excluded.slack_thread`,
          status: sql`excluded.status`,
          description: sql`excluded.description`,
          companyNames: sql`excluded.company_names`,
          employeeEmails: sql`excluded.employee_emails`,
          priority: sql`excluded.priority`,
          ticketType: sql`excluded.ticket_type`,
          dueDate: sql`excluded.due_date`,
          reporter: sql`excluded.reporter`,
          assignee: sql`excluded.assignee`,
          defaultGitEnvironmentId: sql`excluded.default_git_environment_id`,
          createdAt: sql`excluded.created_at`,
          jiraCreatedAt: sql`excluded.jira_created_at`,
          jiraUpdatedAt: sql`excluded.jira_updated_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning();

    return result.map((row) => this.toTicketAggregate(row));
  }

  async load(
    query: TicketSearchQuery,
    options: LoadTicketsOptions = {},
  ): Promise<TicketAggregate[]> {
    const db = getDb();
    const whereClause = this.buildFilters(query);
    const latestDescriptionScoreSubquery = sql<number | null>`(
      select (
        (tse.steps_to_reproduce_score + tse.expected_behavior_score + tse.observed_behavior_score)::float
        / 3.0
      )
      from ${ticketStepExecutionsTph} as tse
      where tse.ticket_id = ${tickets.id}
        and tse.step_name = ${TICKET_DESCRIPTION_QUALITY_STEP_NAME}
      order by tse.started_at desc, tse.id desc
      limit 1
    )`;

    const rows = await db
      .select(ticketSelectFields)
      .from(tickets)
      .where(whereClause)
      .orderBy(
        query.sortBy === "description_score_desc"
          ? sql`${latestDescriptionScoreSubquery} desc nulls last`
          : desc(tickets.updatedAt),
        desc(tickets.updatedAt),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const aggregates = rows.map((row) => this.toTicketAggregate(row));

    if (
      !options.loadTicketPipeline &&
      !options.loadGithubIssue &&
      !options.loadTicketGitEnvironmentAggregate
    ) {
      return aggregates;
    }

    const ticketIds = aggregates
      .map((ticket) => ticket.id)
      .filter((ticketId): ticketId is string => Boolean(ticketId));

    const ticketGitEnvironmentIds = aggregates
      .map((ticket) => ticket.defaultGitEnvironmentId)
      .filter((id): id is number => id !== undefined);

    const [
      pipelineStepsByTicketId,
      githubIssuesByTicketId,
      ticketGitEnvironmentById,
    ] = await Promise.all([
      options.loadTicketPipeline
        ? this.stepExecutionRepo.loadByTicketIds(ticketIds)
        : Promise.resolve(new Map()),
      options.loadGithubIssue
        ? this.loadGithubIssuesByTicketIds(ticketIds)
        : Promise.resolve(new Map()),
      options.loadTicketGitEnvironmentAggregate
        ? this.loadTicketGitEnvironmentByIds(ticketGitEnvironmentIds)
        : Promise.resolve(new Map()),
    ]);

    return aggregates.map((ticket) => {
      let aggregate = ticket;

      if (options.loadTicketPipeline) {
        aggregate = aggregate.withPipelineSteps(
          ticket.id ? pipelineStepsByTicketId.get(ticket.id) : undefined,
        );
      }

      if (options.loadGithubIssue) {
        aggregate = aggregate.withGithubIssue(
          ticket.id ? (githubIssuesByTicketId.get(ticket.id) ?? null) : null,
        );
      }

      if (options.loadTicketGitEnvironmentAggregate) {
        aggregate = aggregate.withTicketGitEnvironmentAggregate(
          ticket.defaultGitEnvironmentId === undefined
            ? null
            : (ticketGitEnvironmentById.get(ticket.defaultGitEnvironmentId) ??
                null),
        );
      }

      return aggregate;
    });
  }

  async loadByTicketNumbers(
    ticketNumbers: string[],
  ): Promise<TicketAggregate[]> {
    if (ticketNumbers.length === 0) {
      return [];
    }

    const db = getDb();
    const rows = await db
      .select(ticketSelectFields)
      .from(tickets)
      .where(inArray(tickets.ticketNumber, ticketNumbers));

    return rows.map((row) => this.toTicketAggregate(row));
  }

  async loadById(
    ticketId: string,
    options: LoadTicketsOptions = {},
  ): Promise<TicketAggregate | null> {
    const db = getDb();
    const [row] = await db
      .select(ticketSelectFields)
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!row) {
      return null;
    }

    const aggregate = this.toTicketAggregate(row);
    const [pipelineSteps, githubIssueByTicketId, ticketGitEnvironment] =
      await Promise.all([
        options.loadTicketPipeline
          ? this.stepExecutionRepo.loadByTicketId(ticketId)
          : Promise.resolve(undefined),
        options.loadGithubIssue
          ? this.loadGithubIssuesByTicketIds([ticketId])
          : Promise.resolve(undefined),
        options.loadTicketGitEnvironmentAggregate &&
        aggregate.defaultGitEnvironmentId !== undefined
          ? this.loadTicketGitEnvironmentByIds([
              aggregate.defaultGitEnvironmentId,
            ])
          : Promise.resolve(undefined),
      ]);

    let loadedAggregate = aggregate;
    if (options.loadTicketPipeline) {
      loadedAggregate = loadedAggregate.withPipelineSteps(pipelineSteps);
    }

    if (options.loadGithubIssue) {
      loadedAggregate = loadedAggregate.withGithubIssue(
        githubIssueByTicketId?.get(ticketId) ?? null,
      );
    }

    if (options.loadTicketGitEnvironmentAggregate) {
      loadedAggregate = loadedAggregate.withTicketGitEnvironmentAggregate(
        aggregate.defaultGitEnvironmentId === undefined
          ? null
          : (ticketGitEnvironment?.get(aggregate.defaultGitEnvironmentId) ??
              null),
      );
    }

    return loadedAggregate;
  }

  async saveGithubIssue(
    githubIssue: TicketGithubIssueEntity,
  ): Promise<TicketGithubIssueEntity> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .insert(ticketGithubIssues)
      .values({
        ticketId: githubIssue.ticketId,
        githubIssueNumber: githubIssue.githubIssueNumber,
        githubIssueId: githubIssue.githubIssueId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: ticketGithubIssues.ticketId,
        set: {
          githubIssueNumber: githubIssue.githubIssueNumber,
          githubIssueId: githubIssue.githubIssueId,
          updatedAt: now,
        },
      })
      .returning();

    return new TicketGithubIssueEntity(
      row.ticketId,
      row.githubIssueNumber,
      row.githubIssueId,
      row.id,
      row.createdAt.toISOString(),
      row.updatedAt.toISOString(),
    );
  }

  async saveDefaultGitEnvironment(
    ticket: TicketAggregate,
    dbExecutor?: DbExecutor,
  ): Promise<TicketAggregate> {
    if (!ticket.id) {
      throw new Error(
        "Cannot persist default git environment for a ticket without id",
      );
    }

    if (ticket.defaultGitEnvironmentId === undefined) {
      throw new Error(
        "Cannot persist default git environment when defaultGitEnvironmentId is undefined",
      );
    }

    const db = dbExecutor ?? getDb();
    const [row] = await db
      .update(tickets)
      .set({
        defaultGitEnvironmentId: ticket.defaultGitEnvironmentId,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticket.id))
      .returning(ticketSelectFields);

    if (!row) {
      throw new Error(`Ticket ${ticket.id} not found`);
    }

    return this.toTicketAggregate(row);
  }

  async count(query: TicketSearchQuery): Promise<number> {
    const db = getDb();
    const whereClause = this.buildFilters(query);

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(whereClause);

    return Number(result?.count ?? 0);
  }
}
