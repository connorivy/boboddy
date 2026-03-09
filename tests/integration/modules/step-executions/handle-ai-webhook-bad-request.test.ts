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
  TICKET_INVESTIGATION_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";

const now = new Date("2026-03-01T12:00:00.000Z").toISOString();

describe("handleAiWebhookBadRequest", () => {
  it("comments on repro PR when execution and ticket git environment are resolved", async () => {
    const stepExecutionId = "018f47ac-7f5a-7cc1-b54a-6f91d5b8e017";
    const execution = new FailingTestReproStepExecutionEntity(
      "CV-100",
      "CV-100",
      "running",
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
      stepExecutionId,
    );

    const stepExecutionRepo = {
      load: vi.fn().mockResolvedValue(execution),
    };
    const ticketRepo = {
      loadById: vi.fn().mockResolvedValue({
        ticketGitEnvironmentAggregate: {
          devBranch: "ephemeral-ADM01-dev",
        },
      }),
    };
    const githubService = {
      commentOnPrByBranches: vi.fn().mockResolvedValue(undefined),
    };

    await handleAiWebhookBadRequest(
      FAILING_TEST_REPRO_STEP_NAME,
      {
        ticketId: "CV-100",
        stepExecutionId,
        agentBranch: "ephemeral-OVERRIDE",
      },
      {
        stepExecutionRepo,
        ticketRepo,
        githubService,
      } as never,
    );

    expect(stepExecutionRepo.load).toHaveBeenCalledWith(stepExecutionId);
    expect(ticketRepo.loadById).toHaveBeenCalledWith("CV-100", {
      loadTicketGitEnvironmentAggregate: true,
    });
    expect(githubService.commentOnPrByBranches).toHaveBeenCalledWith(
      "ephemeral-ADM01-dev",
      "ephemeral-OVERRIDE",
      expect.any(String),
    );

    const customInstructions =
      githubService.commentOnPrByBranches.mock.calls[0]?.[2];
    expect(customInstructions).toContain(
      "tmp/copilot-repro-webhook-payload.json",
    );
    expect(customInstructions).toContain("reproduceOperationOutcome");
  });

  it("comments on fix PR for fix payload correction", async () => {
    const stepExecutionId = "018f47ac-7f5a-7cc1-b54a-6f91d5b8e019";
    const execution = new FailingTestFixStepExecutionEntity(
      "CV-101",
      "CV-101",
      "running",
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
      stepExecutionId,
    );

    const stepExecutionRepo = {
      load: vi.fn().mockResolvedValue(execution),
    };
    const ticketRepo = {
      loadById: vi.fn().mockResolvedValue({
        ticketGitEnvironmentAggregate: {
          devBranch: "ephemeral-MEM9-dev",
        },
      }),
    };
    const githubService = {
      commentOnPrByBranches: vi.fn().mockResolvedValue(undefined),
    };

    await handleAiWebhookBadRequest(
      FAILING_TEST_FIX_STEP_NAME,
      {
        stepExecutionId,
        agentBranch: "ephemeral-fix-attempt",
      },
      {
        stepExecutionRepo,
        ticketRepo,
        githubService,
      } as never,
    );

    expect(stepExecutionRepo.load).toHaveBeenCalledWith(stepExecutionId);
    expect(ticketRepo.loadById).toHaveBeenCalledWith("CV-101", {
      loadTicketGitEnvironmentAggregate: true,
    });
    expect(githubService.commentOnPrByBranches).toHaveBeenCalledWith(
      "ephemeral-MEM9-dev",
      "ephemeral-fix-attempt",
      expect.any(String),
    );

    const customInstructions =
      githubService.commentOnPrByBranches.mock.calls[0]?.[2];
    expect(customInstructions).toContain(
      "tmp/copilot-fix-webhook-payload.json",
    );
  });

  it("does nothing when step execution cannot be resolved", async () => {
    const stepExecutionRepo = {
      load: vi.fn().mockResolvedValue(null),
    };
    const ticketRepo = {
      loadById: vi.fn(),
    };
    const githubService = {
      commentOnPrByBranches: vi.fn(),
    };

    await handleAiWebhookBadRequest(
      FAILING_TEST_REPRO_STEP_NAME,
      {
        ticketId: "CV-404",
        stepExecutionId: "018f47ac-7f5a-7cc1-b54a-6f91d5b8e404",
        agentBranch: "ephemeral-404",
      },
      {
        stepExecutionRepo,
        ticketRepo,
        githubService,
      } as never,
    );

    expect(ticketRepo.loadById).not.toHaveBeenCalled();
    expect(githubService.commentOnPrByBranches).not.toHaveBeenCalled();
  });

  it("comments on enrichment PR for enrichment payload correction", async () => {
    const stepExecutionId = "018f47ac-7f5a-7cc1-b54a-6f91d5b8e020";
    const execution = new TicketDescriptionEnrichmentStepExecutionEntity(
      "CV-102",
      "CV-102",
      "running",
      new TicketDescriptionEnrichmentStepResultEntity(
        "Need corrected payload",
        "enriched description",
        "The previous run did not provide enough investigation detail.",
        ["service:api"],
        "last_60m",
        ["request_id:req-102"],
        [],
        [],
        [],
        [],
        [],
        ["Waiting on corrected payload"],
        ["service:api request_id:req-102"],
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
      stepExecutionId,
    );

    const stepExecutionRepo = {
      load: vi.fn().mockResolvedValue(execution),
    };
    const ticketRepo = {
      loadById: vi.fn().mockResolvedValue({
        ticketGitEnvironmentAggregate: {
          devBranch: "ephemeral-MEM9-dev",
        },
      }),
    };
    const githubService = {
      commentOnPrByBranches: vi.fn().mockResolvedValue(undefined),
    };

    await handleAiWebhookBadRequest(
      TICKET_INVESTIGATION_STEP_NAME,
      {
        ticketId: "CV-102",
        stepExecutionId,
        agentBranch: "ephemeral-enrichment-attempt",
      },
      {
        stepExecutionRepo,
        ticketRepo,
        githubService,
      } as never,
    );

    expect(stepExecutionRepo.load).toHaveBeenCalledWith(stepExecutionId);
    expect(ticketRepo.loadById).toHaveBeenCalledWith("CV-102", {
      loadTicketGitEnvironmentAggregate: true,
    });
    expect(githubService.commentOnPrByBranches).toHaveBeenCalledWith(
      "ephemeral-MEM9-dev",
      "ephemeral-enrichment-attempt",
      expect.any(String),
    );

    const customInstructions =
      githubService.commentOnPrByBranches.mock.calls[0]?.[2];
    expect(customInstructions).toContain(
      "copilot-ticket-description-enrichment-webhook-payload.json",
    );
  });
});
