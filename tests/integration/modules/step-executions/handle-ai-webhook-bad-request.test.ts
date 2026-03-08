import { describe, expect, it, vi } from "vitest";
import { handleAiWebhookBadRequest } from "@/modules/step-executions/application/handle-ai-webhook-bad-request";
import {
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionEnrichmentStepResultEntity,
  FailingTestFixStepExecutionEntity,
  FailingTestFixStepResultEntity,
  FailingTestReproStepExecutionEntity,
  FailingTestReproStepResultEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";

const now = new Date("2026-03-01T12:00:00.000Z").toISOString();

describe("handleAiWebhookBadRequest", () => {
  it("reassigns Copilot for repro payload correction when ticket and pipeline are resolved", async () => {
    const execution = new FailingTestReproStepExecutionEntity(
      "CV-100",
      "running",
      "repro:CV-100:1",
      new FailingTestReproStepResultEntity(
        "draft",
        123,
        "I_kwDO123",
        "complete",
        "ephemeral-ADM01",
        "ephemeral-ADM01",
        "agent_error",
        "Malformed payload",
        null,
      ),
      now,
      undefined,
      now,
      now,
      17,
      1,
    );

    const stepExecutionRepo = {
      load: vi.fn().mockResolvedValue(execution),
    };
    const ticketRepo = {
      loadById: vi.fn().mockResolvedValue({
        githubIssue: {
          githubIssueNumber: 777,
          githubIssueId: "I_kwDO777",
        },
      }),
    };
    const githubService = {
      unassignCopilot: vi.fn().mockResolvedValue(undefined),
      assignCopilot: vi.fn().mockResolvedValue(undefined),
    };

    await handleAiWebhookBadRequest(
      FAILING_TEST_REPRO_STEP_NAME,
      {
        ticketId: "CV-100",
        pipelineId: 17,
        agentBranch: "ephemeral-OVERRIDE",
        summaryOfFindings: "The run output was malformed",
      },
      {
        stepExecutionRepo,
        ticketRepo,
        githubService,
      } as never,
    );

    expect(stepExecutionRepo.load).toHaveBeenCalledWith(17);
    expect(ticketRepo.loadById).toHaveBeenCalledWith("CV-100", {
      loadGithubIssue: true,
    });
    expect(githubService.unassignCopilot).toHaveBeenCalledWith(777);
    expect(githubService.assignCopilot).toHaveBeenCalledWith(
      expect.objectContaining({
        issueNumber: 777,
        baseBranch: "ephemeral-OVERRIDE",
      }),
    );

    const customInstructions = githubService.assignCopilot.mock.calls[0]?.[0]
      ?.customInstructions;
    expect(customInstructions).toContain("tmp/copilot-repro-webhook-payload.json");
    expect(customInstructions).toContain('"const": "CV-100"');
    expect(customInstructions).toContain('"const": 17');
  });

  it("falls back to execution target branch for fix payload correction", async () => {
    const execution = new FailingTestFixStepExecutionEntity(
      "CV-101",
      "running",
      "fix:CV-101:1",
      new FailingTestFixStepResultEntity(
        "open",
        991,
        "I_kwDO991",
        "ephemeral-MEM9-dev1",
        null,
      ),
      now,
      undefined,
      now,
      now,
      19,
      2,
    );

    const stepExecutionRepo = {
      load: vi.fn().mockResolvedValue(execution),
    };
    const ticketRepo = {
      loadById: vi.fn().mockResolvedValue({
        githubIssue: {
          githubIssueNumber: 991,
          githubIssueId: "I_kwDO991",
        },
      }),
    };
    const githubService = {
      unassignCopilot: vi.fn().mockResolvedValue(undefined),
      assignCopilot: vi.fn().mockResolvedValue(undefined),
    };

    await handleAiWebhookBadRequest(
      FAILING_TEST_FIX_STEP_NAME,
      {
        ticketId: "CV-101",
        pipelineId: 19,
      },
      {
        stepExecutionRepo,
        ticketRepo,
        githubService,
      } as never,
    );

    expect(githubService.assignCopilot).toHaveBeenCalledWith(
      expect.objectContaining({
        issueNumber: 991,
        baseBranch: "ephemeral-MEM9-dev1",
      }),
    );

    const customInstructions = githubService.assignCopilot.mock.calls[0]?.[0]
      ?.customInstructions;
    expect(customInstructions).toContain("tmp/copilot-fix-webhook-payload.json");
  });

  it("does nothing when pipeline cannot be resolved", async () => {
    const stepExecutionRepo = {
      load: vi.fn().mockResolvedValue(null),
    };
    const ticketRepo = {
      loadById: vi.fn(),
    };
    const githubService = {
      unassignCopilot: vi.fn(),
      assignCopilot: vi.fn(),
    };

    await handleAiWebhookBadRequest(
      FAILING_TEST_REPRO_STEP_NAME,
      {
        ticketId: "CV-404",
        pipelineId: 404,
      },
      {
        stepExecutionRepo,
        ticketRepo,
        githubService,
      } as never,
    );

    expect(ticketRepo.loadById).not.toHaveBeenCalled();
    expect(githubService.unassignCopilot).not.toHaveBeenCalled();
    expect(githubService.assignCopilot).not.toHaveBeenCalled();
  });

  it("reassigns Copilot for enrichment payload correction", async () => {
    const execution = new TicketDescriptionEnrichmentStepExecutionEntity(
      "CV-102",
      "running",
      "enrich:CV-102:1",
      new TicketDescriptionEnrichmentStepResultEntity(
        "Need corrected payload",
        "enriched description",
        ["service:api"],
        "last_60m",
        ["request_id:req-102"],
        null,
        { example: true },
        "complete",
        "ephemeral-MEM9-dev1",
        "agent_error",
      ),
      now,
      undefined,
      now,
      now,
      20,
      3,
    );

    const stepExecutionRepo = {
      load: vi.fn().mockResolvedValue(execution),
    };
    const ticketRepo = {
      loadById: vi.fn().mockResolvedValue({
        githubIssue: {
          githubIssueNumber: 992,
          githubIssueId: "I_kwDO992",
        },
      }),
    };
    const githubService = {
      unassignCopilot: vi.fn().mockResolvedValue(undefined),
      assignCopilot: vi.fn().mockResolvedValue(undefined),
    };

    await handleAiWebhookBadRequest(
      TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
      {
        ticketId: "CV-102",
        pipelineId: 20,
      },
      {
        stepExecutionRepo,
        ticketRepo,
        githubService,
      } as never,
    );

    expect(githubService.assignCopilot).toHaveBeenCalledWith(
      expect.objectContaining({
        issueNumber: 992,
        baseBranch: "ephemeral-MEM9-dev1",
      }),
    );

    const customInstructions = githubService.assignCopilot.mock.calls[0]?.[0]
      ?.customInstructions;
    expect(customInstructions).toContain(
      "copilot-ticket-description-enrichment-webhook-payload.json",
    );
  });
});
