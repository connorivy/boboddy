import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";
import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import {
  ingestTickets,
  ingestTicketsModifiedSince,
} from "@/modules/tickets/application/batch-ingest";
import {
  loadTicketDetail,
  searchTickets,
} from "@/modules/tickets/application/get-tickets";
import { getTicketGitEnvironments } from "@/modules/environments/application/get-ticket-git-environments";
import type { JiraTicketRepo } from "@/modules/tickets/application/jira-ticket-repo";
import type { TicketIngestInput } from "@/modules/tickets/contracts/ticket-contracts";
import {
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { TicketGithubIssueEntity } from "@/modules/tickets/domain/ticket-github-issue.entity";
import { getDb } from "@/lib/db";
import { ticketStepExecutionsTph } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DrizzleTicketGitEnvironmentRepo } from "@/modules/environments/infra/drizzle-ticket-git-environment-repo";
import { TicketGitEnvironmentAggregate } from "@/modules/environments/domain/ticket-git-environment-aggregate";
import { DrizzleEnvironmentRepo } from "@/modules/environments/infra/drizzle-environment-repo";
import { EnvironmentAggregate } from "@/modules/environments/domain/environment-aggregate";
import {
  truncateTestTables,
} from "../../helpers/pgvector-test-db";
import {
  TicketDuplicateCandidateResultItemEntity,
  TicketDuplicateCandidatesResultEntity,
  TicketDescriptionQualityStepExecutionEntity,
  TicketDescriptionQualityStepResultEntity,
  TicketDuplicateCandidatesStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";

const makeTicketAggregate = (
  overrides: Partial<TicketIngestInput> = {},
): TicketAggregate =>
  TicketAggregate.create({
    ticketNumber: "CV-100",
    title: "Broken login flow",
    slackThread: null,
    status: "needs_triage",
    description: "Users cannot log in after MFA challenge",
    companyNames: ["Acme Co"],
    employeeEmails: ["reporter@acme.test"],
    priority: "medium",
    ticketType: "bug",
    dueDate: null,
    reporter: "reporter@acme.test",
    assignee: "owner@acme.test",
    jiraCreatedAt: "2026-01-02T10:00:00.000Z",
    jiraUpdatedAt: "2026-01-02T11:00:00.000Z",
    ...overrides,
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const backfillDescriptionStepResultFields = async (stepExecutionId: string) => {
  const db = getDb();
  await db
    .update(ticketStepExecutionsTph)
    .set({
      stepsToReproduceScore: 4,
      expectedBehaviorScore: 4,
      observedBehaviorScore: 4,
      reasoning: "Integration test seed payload",
      rawResponse: '{"score":4}',
      updatedAt: new Date(),
    })
    .where(eq(ticketStepExecutionsTph.id, stepExecutionId));
};

describe("tickets module use cases (integration)", () => {
  const ticketRepo = new DrizzleTicketRepo();
  const stepExecutionRepo = new DrizzleStepExecutionRepo();
  const ticketGitEnvironmentRepo = new DrizzleTicketGitEnvironmentRepo();
  const environmentRepo = new DrizzleEnvironmentRepo();

  beforeEach(async () => {
    await truncateTestTables();
  });

  it("ingestTickets persists Jira tickets using a mocked Jira repo", async () => {
    const jiraTickets = [
      makeTicketAggregate({ ticketNumber: "CV-101", title: "Login broken" }),
      makeTicketAggregate({ ticketNumber: "CV-102", title: "Payroll timeout" }),
    ];

    const jiraTicketRepo: JiraTicketRepo = {
      fetchByTicketNumbers: vi.fn().mockResolvedValue(jiraTickets),
      fetchModifiedSince: vi.fn(),
      fetchByBoardId: vi.fn(),
    };

    const result = await ingestTickets(["CV-101", "CV-102"], {
      ticketRepo,
      jiraTicketRepo,
    });

    expect(jiraTicketRepo.fetchByTicketNumbers).toHaveBeenCalledWith([
      "CV-101",
      "CV-102",
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((ticket) => ticket.id)).toEqual(["CV-101", "CV-102"]);

    const persisted = await ticketRepo.loadByTicketNumbers([
      "CV-101",
      "CV-102",
    ]);
    expect(persisted).toHaveLength(2);
    expect(persisted.map((ticket) => ticket.ticketNumber).sort()).toEqual([
      "CV-101",
      "CV-102",
    ]);
  });

  it("ingestTicketsModifiedSince upserts existing rows and inserts new rows", async () => {
    await ticketRepo.saveMany([
      makeTicketAggregate({
        ticketNumber: "CV-201",
        title: "Original title",
        status: "needs_more_information",
      }),
    ]);

    const jiraTicketRepo: JiraTicketRepo = {
      fetchByTicketNumbers: vi.fn(),
      fetchModifiedSince: vi.fn().mockResolvedValue([
        makeTicketAggregate({
          ticketNumber: "CV-201",
          title: "Updated title",
          status: "in_progress",
        }),
        makeTicketAggregate({
          ticketNumber: "CV-202",
          title: "Newly discovered issue",
          status: "needs_triage",
        }),
      ]),
      fetchByBoardId: vi.fn(),
    };

    const result = await ingestTicketsModifiedSince("2026-01-01", {
      ticketRepo,
      jiraTicketRepo,
    });

    expect(jiraTicketRepo.fetchModifiedSince).toHaveBeenCalledWith(
      "2026-01-01",
    );
    expect(result.map((ticket) => ticket.ticketNumber).sort()).toEqual([
      "CV-201",
      "CV-202",
    ]);

    const [updated] = await ticketRepo.loadByTicketNumbers(["CV-201"]);
    expect(updated.title).toBe("Updated title");
    expect(updated.status).toBe("in_progress");
  });

  it("searchTickets returns filtered, paginated ticket contracts", async () => {
    await ticketRepo.saveMany([
      makeTicketAggregate({
        ticketNumber: "CV-301",
        title: "Login issue for admins",
        status: "needs_triage",
        priority: "high",
      }),
      makeTicketAggregate({
        ticketNumber: "CV-302",
        title: "Login issue for managers",
        status: "needs_triage",
        priority: "high",
      }),
      makeTicketAggregate({
        ticketNumber: "CV-303",
        title: "Billing webhook retry",
        status: "done",
        priority: "low",
      }),
    ]);

    await sleep(10);

    const page1 = await searchTickets(
      {
        q: "Login",
        status: "needs_triage",
        priority: "high",
        page: 1,
        pageSize: 1,
      },
      { ticketRepo },
    );

    const page2 = await searchTickets(
      {
        q: "Login",
        status: "needs_triage",
        priority: "high",
        page: 2,
        pageSize: 1,
      },
      { ticketRepo },
    );

    expect(page1.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
    });
    expect(page1.items).toHaveLength(1);
    expect(page2.items).toHaveLength(1);

    const seenTicketNumbers = [
      page1.items[0].ticketNumber,
      page2.items[0].ticketNumber,
    ].sort();

    expect(seenTicketNumbers).toEqual(["CV-301", "CV-302"]);
  });

  it("supports optional githubIssue loading semantics on the ticket aggregate", async () => {
    await ticketRepo.saveMany([
      makeTicketAggregate({
        ticketNumber: "CV-350",
        title: "GitHub issue linkage semantics",
      }),
    ]);

    const unloaded = await ticketRepo.loadById("CV-350");
    expect(unloaded?.githubIssue).toBeUndefined();

    const loadedWithoutIssue = await ticketRepo.loadById("CV-350", {
      loadGithubIssue: true,
    });
    expect(loadedWithoutIssue?.githubIssue).toBeNull();

    await ticketRepo.saveGithubIssue(
      new TicketGithubIssueEntity("CV-350", 9350, "I_kwDOFAKE9350"),
    );

    const loadedWithIssue = await ticketRepo.loadById("CV-350", {
      loadGithubIssue: true,
    });
    expect(loadedWithIssue?.githubIssue).not.toBeNull();
    expect(loadedWithIssue?.githubIssue?.githubIssueNumber).toBe(9350);
  });

  it("searchTickets can sort by latest description score across all results", async () => {
    await ticketRepo.saveMany([
      makeTicketAggregate({
        ticketNumber: "CV-321",
        title: "Highest score",
      }),
      makeTicketAggregate({
        ticketNumber: "CV-322",
        title: "Lower score",
      }),
      makeTicketAggregate({
        ticketNumber: "CV-323",
        title: "Middle score",
      }),
      makeTicketAggregate({
        ticketNumber: "CV-324",
        title: "No score yet",
      }),
    ]);

    await stepExecutionRepo.save(
      new TicketDescriptionQualityStepExecutionEntity(
        "CV-321",
        "succeeded",
        "desc-quality:CV-321:1",
        new TicketDescriptionQualityStepResultEntity(
          5,
          5,
          5,
          "Excellent description",
          '{"score":5}',
        ),
        "2026-02-01T11:00:00.000Z",
        "2026-02-01T11:01:00.000Z",
      ),
    );
    await stepExecutionRepo.save(
      new TicketDescriptionQualityStepExecutionEntity(
        "CV-322",
        "succeeded",
        "desc-quality:CV-322:1",
        new TicketDescriptionQualityStepResultEntity(
          3,
          3,
          3,
          "Average description",
          '{"score":3}',
        ),
        "2026-02-01T11:02:00.000Z",
        "2026-02-01T11:03:00.000Z",
      ),
    );
    await stepExecutionRepo.save(
      new TicketDescriptionQualityStepExecutionEntity(
        "CV-323",
        "succeeded",
        "desc-quality:CV-323:1",
        new TicketDescriptionQualityStepResultEntity(
          4,
          4,
          4,
          "Good description",
          '{"score":4}',
        ),
        "2026-02-01T11:04:00.000Z",
        "2026-02-01T11:05:00.000Z",
      ),
    );

    const page1 = await searchTickets(
      {
        sortBy: "description_score_desc",
        page: 1,
        pageSize: 2,
      },
      { ticketRepo },
    );
    const page2 = await searchTickets(
      {
        sortBy: "description_score_desc",
        page: 2,
        pageSize: 2,
      },
      { ticketRepo },
    );

    expect(page1.items.map((ticket) => ticket.ticketNumber)).toEqual([
      "CV-321",
      "CV-323",
    ]);
    expect(page2.items.map((ticket) => ticket.ticketNumber)).toEqual([
      "CV-322",
      "CV-324",
    ]);
  });

  it("searchTickets can filter by step name and latest step execution status", async () => {
    await ticketRepo.saveMany([
      makeTicketAggregate({
        ticketNumber: "CV-311",
        title: "Step status running",
      }),
      makeTicketAggregate({
        ticketNumber: "CV-312",
        title: "Step status succeeded",
      }),
      makeTicketAggregate({
        ticketNumber: "CV-313",
        title: "No step execution yet",
      }),
      makeTicketAggregate({
        ticketNumber: "CV-314",
        title: "Different step only",
      }),
    ]);

    const cv311QueuedExecution = await stepExecutionRepo.save(
      new TicketDescriptionQualityStepExecutionEntity(
        "CV-311",
        "queued",
        "desc-quality:CV-311:1",
        null,
        "2026-02-01T10:00:00.000Z",
      ),
    );
    await backfillDescriptionStepResultFields(cv311QueuedExecution.id!);

    const cv311RunningExecution = await stepExecutionRepo.save(
      new TicketDescriptionQualityStepExecutionEntity(
        "CV-311",
        "running",
        "desc-quality:CV-311:2",
        null,
        "2026-02-01T10:05:00.000Z",
      ),
    );
    await backfillDescriptionStepResultFields(cv311RunningExecution.id!);

    const cv312SucceededExecution = await stepExecutionRepo.save(
      new TicketDescriptionQualityStepExecutionEntity(
        "CV-312",
        "succeeded",
        "desc-quality:CV-312:1",
        new TicketDescriptionQualityStepResultEntity(
          4,
          4,
          4,
          "Integration test seed payload",
          '{"score":4}',
        ),
        "2026-02-01T10:10:00.000Z",
      ),
    );

    await stepExecutionRepo.save(
      new TicketDuplicateCandidatesStepResultEntity(
        "CV-314",
        "running",
        "dupe-search:CV-314:1",
        null,
        "2026-02-01T10:15:00.000Z",
      ),
    );

    const running = await searchTickets(
      {
        stepName: TICKET_DESCRIPTION_QUALITY_STEP_NAME,
        stepExecutionStatus: "running",
        page: 1,
        pageSize: 50,
      },
      { ticketRepo },
    );
    expect(running.pagination.total).toBe(1);
    expect(running.items.map((ticket) => ticket.ticketNumber)).toEqual([
      "CV-311",
    ]);

    const succeeded = await searchTickets(
      {
        stepName: TICKET_DESCRIPTION_QUALITY_STEP_NAME,
        stepExecutionStatus: "succeeded",
        page: 1,
        pageSize: 50,
      },
      { ticketRepo },
    );
    expect(succeeded.pagination.total).toBe(1);
    expect(succeeded.items.map((ticket) => ticket.ticketNumber)).toEqual([
      "CV-312",
    ]);

    const notStarted = await searchTickets(
      {
        stepName: TICKET_DESCRIPTION_QUALITY_STEP_NAME,
        stepExecutionStatus: "not_started",
        page: 1,
        pageSize: 50,
      },
      { ticketRepo },
    );
    expect(notStarted.pagination.total).toBe(2);
    expect(
      notStarted.items.map((ticket) => ticket.ticketNumber).sort(),
    ).toEqual(["CV-313", "CV-314"]);
  });

  it("loadTicketDetail returns ticket and persisted pipeline execution data", async () => {
    await ticketRepo.saveMany([
      makeTicketAggregate({
        ticketNumber: "CV-401",
        title: "Ticket with pipeline",
      }),
      makeTicketAggregate({
        ticketNumber: "CV-402",
        title: "Candidate duplicate",
      }),
    ]);

    const descriptionExecution = await stepExecutionRepo.save(
      new TicketDescriptionQualityStepExecutionEntity(
        "CV-401",
        "queued",
        "desc-quality:CV-401:1",
        null,
        "2026-02-01T10:00:00.000Z",
      ),
    );

    await stepExecutionRepo.save(
      new TicketDescriptionQualityStepExecutionEntity(
        descriptionExecution.pipelineId,
        "succeeded",
        descriptionExecution.idempotencyKey,
        new TicketDescriptionQualityStepResultEntity(
          4,
          5,
          4,
          "Good report with minor gaps",
          '{"score":4.3}',
        ),
        descriptionExecution.startedAt,
        "2026-02-01T10:03:00.000Z",
        descriptionExecution.createdAt,
        descriptionExecution.updatedAt,
        descriptionExecution.id,
      ),
    );

    const duplicateExecution = await stepExecutionRepo.save(
      new TicketDuplicateCandidatesStepResultEntity(
        "CV-401",
        "queued",
        "dupe-search:CV-401:1",
        null,
        "2026-02-01T10:05:00.000Z",
      ),
    );

    await stepExecutionRepo.save(
      new TicketDuplicateCandidatesStepResultEntity(
        duplicateExecution.pipelineId,
        "succeeded",
        duplicateExecution.idempotencyKey,
        new TicketDuplicateCandidatesResultEntity(
          [new TicketDuplicateCandidateResultItemEntity("CV-402", 0.93)],
          [],
          [],
        ),
        duplicateExecution.startedAt,
        "2026-02-01T10:07:00.000Z",
        duplicateExecution.createdAt,
        duplicateExecution.updatedAt,
        duplicateExecution.id,
      ),
    );

    const detail = await loadTicketDetail("CV-401", {
      ticketRepo,
      stepExecutionRepo,
    });

    expect(detail.ticket.ticketNumber).toBe("CV-401");
    expect(detail.pipeline.stepExecutions).toHaveLength(2);

    const duplicateStep = detail.pipeline.stepExecutions.find(
      (execution) =>
        execution.stepName === TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
    );

    expect(duplicateStep?.status).toBe("succeeded");
    expect(duplicateStep?.result).toMatchObject({
      executionId: duplicateExecution.id,
      stepName: TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
      proposed: [
        {
          candidateTicketId: "CV-402",
          score: 0.93,
        },
      ],
      dismissed: [],
      promoted: [],
    });
  });

  it("returns default git environment fields on ticket contracts when assigned", async () => {
    await ticketRepo.saveMany([
      makeTicketAggregate({
        ticketNumber: "CV-450",
        title: "Ticket with default git environment",
      }),
    ]);
    await environmentRepo.save(
      new EnvironmentAggregate("mem-2", "mem", 2, "us-east-1", 0, new Date()),
    );

    const savedEnvironment = await ticketGitEnvironmentRepo.save(
      new TicketGitEnvironmentAggregate(
        "CV-450",
        "mem-2",
        "ephemeral-MEM2-dev123",
      ),
    );
    const ticket = await ticketRepo.loadById("CV-450");
    expect(ticket).not.toBeNull();

    if (!ticket || savedEnvironment.id === undefined) {
      throw new Error("Failed to seed ticket default git environment for test");
    }

    await ticketRepo.saveDefaultGitEnvironment(
      ticket.assignDefaultGitEnvironment(savedEnvironment.id),
    );

    const search = await searchTickets(
      {
        q: "CV-450",
        page: 1,
        pageSize: 25,
      },
      { ticketRepo },
    );

    expect(search.items).toHaveLength(1);
    expect(search.items[0].defaultGitEnvironmentId).toBe(savedEnvironment.id);
    expect(search.items[0].defaultGitEnvironment).toMatchObject({
      id: savedEnvironment.id,
      ticketId: "CV-450",
      baseEnvironmentId: "mem-2",
      devBranch: "ephemeral-MEM2-dev123",
    });

    const detail = await loadTicketDetail("CV-450", {
      ticketRepo,
      stepExecutionRepo,
    });
    expect(detail.ticket.defaultGitEnvironmentId).toBe(savedEnvironment.id);
    expect(detail.ticket.defaultGitEnvironment).toMatchObject({
      id: savedEnvironment.id,
      ticketId: "CV-450",
      baseEnvironmentId: "mem-2",
      devBranch: "ephemeral-MEM2-dev123",
    });
  });

  it("returns all ticket git environments assigned to a ticket id", async () => {
    await ticketRepo.saveMany([
      makeTicketAggregate({
        ticketNumber: "CV-451",
        title: "Ticket git environment lookup",
      }),
      makeTicketAggregate({
        ticketNumber: "CV-452",
        title: "Another ticket",
      }),
    ]);
    await environmentRepo.save(
      new EnvironmentAggregate("mem-3", "mem", 3, "us-east-1", 0, new Date()),
    );
    await environmentRepo.save(
      new EnvironmentAggregate("mem-4", "mem", 4, "us-east-1", 0, new Date()),
    );

    const targetEnvironment = await ticketGitEnvironmentRepo.save(
      new TicketGitEnvironmentAggregate(
        "CV-451",
        "mem-3",
        "ephemeral-MEM3-dev451",
      ),
    );
    await ticketGitEnvironmentRepo.save(
      new TicketGitEnvironmentAggregate(
        "CV-452",
        "mem-4",
        "ephemeral-MEM4-dev452",
      ),
    );

    const environments = await getTicketGitEnvironments("CV-451", {
      ticketGitEnvironmentRepo,
    });

    expect(environments).toHaveLength(1);
    expect(environments[0]).toMatchObject({
      id: targetEnvironment.id,
      ticketId: "CV-451",
      baseEnvironmentId: "mem-3",
      devBranch: "ephemeral-MEM3-dev451",
    });
  });

  it("loadTicketDetail throws when the ticket is not found", async () => {
    await expect(
      loadTicketDetail("CV-999", {
        ticketRepo,
        stepExecutionRepo,
      }),
    ).rejects.toThrow("Ticket with ID CV-999 not found");
  });
});
