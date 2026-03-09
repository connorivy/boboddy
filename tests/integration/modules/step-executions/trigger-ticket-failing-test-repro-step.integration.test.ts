import { beforeEach, describe, expect, it, vi } from "vitest";
import { TicketAggregate } from "@/modules/tickets/domain/ticket-aggregate";
import type { TicketIngestInput } from "@/modules/tickets/contracts/ticket-contracts";
import { DrizzleTicketRepo } from "@/modules/tickets/infra/drizzle-ticket-repo";
import { DrizzleStepExecutionRepo } from "@/modules/step-executions/infra/step-execution-repo";
import { FAILING_TEST_REPRO_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";
import { triggerTicketFailingTestReproStep } from "@/modules/step-executions/github_repro_failing_test/application/trigger-ticket-failing-test-repro-step";
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
    ticketNumber: "CV-901",
    title: "Users cannot submit profile changes",
    slackThread: null,
    status: "needs_triage",
    description: "Saving profile changes throws 500 on submit.",
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

describe("triggerTicketFailingTestReproStep (integration)", () => {
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

  it("creates an in-progress step execution, creates issue, and assigns Copilot using latest healthy environment", async () => {
    await ticketRepo.saveMany([makeTicketAggregate()]);

    hoisted.requestMock
      .mockResolvedValueOnce({
        data: {
          object: {
            sha: "base-sha-777",
          },
        },
      })
      .mockResolvedValueOnce({ data: {} });

    const githubService = {
      createIssue: vi.fn().mockResolvedValue({
        issueNumber: 777,
        issueId: "I_kwDOFAKE777",
      }),
      unassignCopilot: vi.fn().mockResolvedValue(undefined),
      upsertFile: vi.fn().mockResolvedValue(undefined),
      assignCopilot: vi.fn().mockResolvedValue(undefined),
    };

    await upsertEnvironment("mem-9", "us-east-1", { environmentRepo });
    const result = await triggerTicketFailingTestReproStep(
      { ticketId: "CV-901" },
      {
        ticketRepo,
        stepExecutionRepo,
        ticketGitEnvironmentRepo,
        githubService: githubService as never,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.data.stepExecution.pipelineId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.data.stepExecution.stepName).toBe(
      FAILING_TEST_REPRO_STEP_NAME,
    );
    expect(result.data.stepExecution.status).toBe("running");
    expect(result.data.stepExecution.endedAt).toBeNull();
    expect(result.data.stepExecution.result).toBeNull();

    expect(githubService.createIssue).toHaveBeenCalledTimes(1);
    expect(githubService.createIssue).toHaveBeenCalledWith({
      title: "Users cannot submit profile changes",
      body: "Saving profile changes throws 500 on submit.",
    });
    expect(githubService.unassignCopilot).not.toHaveBeenCalled();
    expect(githubService.upsertFile).toHaveBeenCalledTimes(1);
    expect(githubService.upsertFile).toHaveBeenCalledWith(
      "boboddy-state.json",
      expect.stringMatching(/^ephemeral-MEM9-dev\d+$/),
      expect.stringContaining(`"stepName": "${FAILING_TEST_REPRO_STEP_NAME}"`),
    );
    expect(githubService.assignCopilot).toHaveBeenCalledTimes(1);
    expect(githubService.assignCopilot).toHaveBeenCalledWith({
      issueNumber: 777,
      baseBranch: expect.stringMatching(/^ephemeral-MEM9-dev\d+$/),
      customInstructions: expect.any(String),
    });

    const assignCopilotArgs = githubService.assignCopilot.mock.calls[0]?.[0];
    expect(assignCopilotArgs?.customInstructions).toContain(
      '"const": "CV-901"',
    );
    expect(assignCopilotArgs?.customInstructions).toContain('"pipelineId":');
    expect(assignCopilotArgs?.customInstructions).toContain(
      '"reproduceOperationOutcome"',
    );

    const [getBaseRefCall, createDevRefCall] = hoisted.requestMock.mock.calls;

    expect(getBaseRefCall).toBeDefined();
    expect(getBaseRefCall[0]).toBe("GET /repos/{owner}/{repo}/git/ref/{ref}");
    expect(getBaseRefCall[1]).toMatchObject({
      owner: "takecommand",
      repo: "hrahub",
      ref: "heads/ephemeral-MEM9",
    });

    expect(createDevRefCall).toBeDefined();
    expect(createDevRefCall[0]).toBe("POST /repos/{owner}/{repo}/git/refs");
    expect(createDevRefCall[1]).toMatchObject({
      owner: "takecommand",
      repo: "hrahub",
      ref: expect.stringMatching(/^refs\/heads\/ephemeral-MEM9-dev\d+$/),
      sha: "base-sha-777",
    });

    expect(hoisted.requestMock).toHaveBeenCalledTimes(2);
    const persistedExecutions =
      await stepExecutionRepo.loadByTicketId("CV-901");
    expect(persistedExecutions).toHaveLength(1);
    expect(persistedExecutions[0].stepName).toBe(FAILING_TEST_REPRO_STEP_NAME);
    expect(persistedExecutions[0].status).toBe("running");

    const loadedTicket = await ticketRepo.loadById("CV-901", {
      loadGithubIssue: true,
    });
    expect(loadedTicket?.githubIssue).not.toBeNull();
    expect(loadedTicket?.githubIssue?.githubIssueNumber).toBe(777);
    expect(loadedTicket?.githubIssue?.githubIssueId).toBe("I_kwDOFAKE777");
  });

  it("reuses an existing GitHub issue mapping by unassigning and reassigning Copilot", async () => {
    await ticketRepo.saveMany([makeTicketAggregate()]);
    await ticketRepo.saveGithubIssue(
      new TicketGithubIssueEntity("CV-901", 801, "I_kwDOFAKE801"),
    );

    await upsertEnvironment("mem-9", "us-east-1", { environmentRepo });
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

    const result = await triggerTicketFailingTestReproStep(
      { ticketId: "CV-901" },
      {
        ticketRepo,
        stepExecutionRepo,
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
    expect(githubService.upsertFile).toHaveBeenCalledTimes(1);
    expect(githubService.upsertFile).toHaveBeenCalledWith(
      "boboddy-state.json",
      expect.stringMatching(/^ephemeral-MEM9-dev\d+$/),
      expect.stringContaining(`"stepName": "${FAILING_TEST_REPRO_STEP_NAME}"`),
    );
    expect(githubService.assignCopilot).toHaveBeenCalledTimes(1);
    expect(githubService.assignCopilot).toHaveBeenCalledWith({
      issueNumber: 801,
      baseBranch: expect.stringMatching(/^ephemeral-MEM9-dev\d+$/),
      customInstructions: expect.any(String),
    });

    expect(hoisted.requestMock).toHaveBeenCalledTimes(2);
    expect(hoisted.requestMock.mock.calls[0]?.[0]).toBe(
      "GET /repos/{owner}/{repo}/git/ref/{ref}",
    );
    expect(hoisted.requestMock.mock.calls[0]?.[1]).toMatchObject({
      owner: "takecommand",
      repo: "hrahub",
      ref: "heads/ephemeral-MEM9",
    });
    expect(hoisted.requestMock.mock.calls[1]?.[0]).toBe(
      "POST /repos/{owner}/{repo}/git/refs",
    );
    expect(hoisted.requestMock.mock.calls[1]?.[1]).toMatchObject({
      owner: "takecommand",
      repo: "hrahub",
      ref: expect.stringMatching(/^refs\/heads\/ephemeral-MEM9-dev\d+$/),
      sha: "base-sha-801",
    });

    const [savedExecution] = await stepExecutionRepo.loadByTicketId("CV-901");
    expect(savedExecution).toBeDefined();
    expect(savedExecution.stepName).toBe(FAILING_TEST_REPRO_STEP_NAME);
    expect(savedExecution.status).toBe("running");
  });
});
