import { beforeEach, describe, expect, it, vi } from "vitest";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";
import type { TicketIngestInput } from "@/modules/tickets/contracts/ticket-contracts";
import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import {
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { triggerTicketDescriptionEnrichmentStep } from "@/modules/step-executions/ticket_description_enrichment/application/trigger-ticket-description-enrichment-step";
import { TicketGithubIssueEntity } from "@/modules/tickets/domain/ticket-github-issue.entity";
import { truncateTestTables } from "../../helpers/pgvector-test-db";
import { upsertEnvironment } from "@/modules/environments/application/upsert-environment";
import { DrizzleEnvironmentRepo } from "@/modules/environments/infra/drizzle-environment-repo";
import { DrizzleTicketGitEnvironmentRepo } from "@/modules/environments/infra/drizzle-ticket-git-environment-repo";

const hoisted = vi.hoisted(() => ({
  requestMock: vi.fn(),
  octokitConstructorMock: vi.fn(),
}));

vi.mock("@octokit/rest", () => {
  class MockOctokit {
    request = hoisted.requestMock;

    constructor() {
      hoisted.octokitConstructorMock();
    }
  }

  return {
    Octokit: MockOctokit,
  };
});

const makeTicketAggregate = (
  overrides: Partial<TicketIngestInput> = {},
): TicketAggregate =>
  TicketAggregate.create({
    ticketNumber: "CV-951",
    title: "Random 500 while loading session history",
    slackThread: null,
    status: "needs_triage",
    description: "Users intermittently hit 500 on /api/session/history.",
    companyNames: ["Acme Co"],
    employeeEmails: ["reporter@acme.test"],
    priority: "high",
    ticketType: "bug",
    dueDate: null,
    reporter: "reporter@acme.test",
    assignee: "owner@acme.test",
    jiraCreatedAt: "2026-02-20T10:00:00.000Z",
    jiraUpdatedAt: "2026-02-20T11:00:00.000Z",
    ...overrides,
  });

describe("triggerTicketDescriptionEnrichmentStep (integration)", () => {
  const ticketRepo = new DrizzleTicketRepo();
  const stepExecutionRepo = new DrizzleStepExecutionRepo();
  const environmentRepo = new DrizzleEnvironmentRepo();
  const ticketGitEnvironmentRepo = new DrizzleTicketGitEnvironmentRepo();

  beforeEach(async () => {
    await truncateTestTables();
    hoisted.requestMock.mockReset();
    hoisted.octokitConstructorMock.mockClear();

    process.env.GITHUB_TOKEN = "test-gh-token";
    process.env.GITHUB_REPOSITORY = "takecommand/hrahub";
  });

  it("creates a running enrichment step and assigns the remote GitHub agent", async () => {
    await ticketRepo.saveMany([makeTicketAggregate()]);

    hoisted.requestMock
      .mockResolvedValueOnce({
        data: {
          object: {
            sha: "base-sha-951",
          },
        },
      })
      .mockResolvedValueOnce({ data: {} });

    const githubService = {
      createIssue: vi.fn().mockResolvedValue({
        issueNumber: 951,
        issueId: "I_kwDOFAKE951",
      }),
      unassignCopilot: vi.fn().mockResolvedValue(undefined),
      upsertFile: vi.fn().mockResolvedValue(undefined),
      assignCopilot: vi.fn().mockResolvedValue(undefined),
    };

    await upsertEnvironment(
      "mem-9",
      "us-east-1",
      "https://mem-9-db.internal",
      { environmentRepo },
    );

    const result = await triggerTicketDescriptionEnrichmentStep(
      { ticketId: "CV-951" },
      {
        ticketRepo,
        stepExecutionRepo,
        environmentRepo,
        ticketGitEnvironmentRepo,
        githubService: githubService as never,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data.stepExecution.pipelineId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.data.stepExecution.stepName).toBe(
      TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
    );
    expect(result.data.stepExecution.status).toBe("running");
    expect(result.data.stepExecution.endedAt).toBeNull();
    expect(result.data.stepExecution.result).toBeNull();

    expect(githubService.createIssue).toHaveBeenCalledTimes(1);
    expect(githubService.createIssue).toHaveBeenCalledWith({
      title: "Random 500 while loading session history",
      body: "Users intermittently hit 500 on /api/session/history.",
    });
    expect(githubService.unassignCopilot).not.toHaveBeenCalled();
    expect(githubService.upsertFile).toHaveBeenCalledTimes(1);
    expect(githubService.upsertFile).toHaveBeenCalledWith(
      "boboddy-state.json",
      expect.stringMatching(/^ephemeral-MEM9-dev\d+$/),
      expect.stringContaining('"dbHost": "https://mem-9-db.internal"'),
    );
    expect(githubService.assignCopilot).toHaveBeenCalledTimes(1);
    expect(githubService.assignCopilot).toHaveBeenCalledWith({
      issueNumber: 951,
      baseBranch: expect.stringMatching(/^ephemeral-MEM9-dev\d+$/),
      customAgent: "ticket-description-enrichment-agent",
      customInstructions: expect.any(String),
    });

    const assignCopilotArgs = githubService.assignCopilot.mock.calls[0]?.[0];
    expect(assignCopilotArgs?.customInstructions).toContain(
      '"const": "CV-951"',
    );
    expect(assignCopilotArgs?.customInstructions).toContain('"pipelineId":');
    expect(assignCopilotArgs?.customInstructions).toContain(
      '"operationOutcome"',
    );
    expect(assignCopilotArgs?.customInstructions).toContain(
      "copilot-ticket-description-enrichment-webhook-payload.json",
    );

    expect(hoisted.requestMock).toHaveBeenCalledTimes(2);

    const persistedExecutions = await stepExecutionRepo.loadByTicketId("CV-951");
    expect(persistedExecutions).toHaveLength(1);
    expect(persistedExecutions[0].stepName).toBe(
      TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
    );
    expect(persistedExecutions[0].status).toBe("running");

    const loadedTicket = await ticketRepo.loadById("CV-951", {
      loadGithubIssue: true,
    });
    expect(loadedTicket?.githubIssue).not.toBeNull();
    expect(loadedTicket?.githubIssue?.githubIssueNumber).toBe(951);
    expect(loadedTicket?.githubIssue?.githubIssueId).toBe("I_kwDOFAKE951");
  });

  it("reuses an existing GitHub issue mapping by unassigning and reassigning Copilot", async () => {
    await ticketRepo.saveMany([makeTicketAggregate()]);
    await ticketRepo.saveGithubIssue(
      new TicketGithubIssueEntity("CV-951", 801, "I_kwDOFAKE801"),
    );

    await upsertEnvironment(
      "mem-9",
      "us-east-1",
      "https://mem-9-db.internal",
      { environmentRepo },
    );
    hoisted.requestMock
      .mockResolvedValueOnce({
        data: {
          object: {
            sha: "base-sha-801",
          },
        },
      })
      .mockResolvedValueOnce({ data: {} });

    const githubService = {
      createIssue: vi.fn().mockResolvedValue({
        issueNumber: 999,
        issueId: "I_kwDOFAKE999",
      }),
      unassignCopilot: vi.fn().mockResolvedValue(undefined),
      upsertFile: vi.fn().mockResolvedValue(undefined),
      assignCopilot: vi.fn().mockResolvedValue(undefined),
    };

    const result = await triggerTicketDescriptionEnrichmentStep(
      { ticketId: "CV-951" },
      {
        ticketRepo,
        stepExecutionRepo,
        environmentRepo,
        ticketGitEnvironmentRepo,
        githubService: githubService as never,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data.stepExecution.status).toBe("running");
    expect(result.data.stepExecution.result).toBeNull();
    expect(githubService.createIssue).not.toHaveBeenCalled();
    expect(githubService.unassignCopilot).toHaveBeenCalledTimes(1);
    expect(githubService.unassignCopilot).toHaveBeenCalledWith(801);
    expect(githubService.assignCopilot).toHaveBeenCalledWith({
      issueNumber: 801,
      baseBranch: expect.stringMatching(/^ephemeral-MEM9-dev\d+$/),
      customAgent: "ticket-description-enrichment-agent",
      customInstructions: expect.any(String),
    });

    const [savedExecution] = await stepExecutionRepo.loadByTicketId("CV-951");
    expect(savedExecution).toBeDefined();
    expect(savedExecution.stepName).toBe(TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME);
    expect(savedExecution.status).toBe("running");
  });
});
