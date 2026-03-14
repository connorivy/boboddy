import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SandboxAgentRunLauncher } from "@/modules/ai/infra/agent-run-launcher";
import {
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";

describe("SandboxAgentRunLauncher", () => {
  const originalEnv = {
    SANDBOX_AGENT_BASE_URL: process.env.SANDBOX_AGENT_BASE_URL,
    SANDBOX_AGENT_REPOSITORY: process.env.SANDBOX_AGENT_REPOSITORY,
    SANDBOX_AGENT_TOKEN: process.env.SANDBOX_AGENT_TOKEN,
    APP_BASE_URL: process.env.APP_BASE_URL,
    BOBODDY_API_KEY: process.env.BOBODDY_API_KEY,
  };

  beforeEach(() => {
    process.env.SANDBOX_AGENT_BASE_URL = "http://sandbox.test";
    process.env.SANDBOX_AGENT_REPOSITORY = "owner/repo";
    process.env.SANDBOX_AGENT_TOKEN = "sandbox-token";
    process.env.APP_BASE_URL = "http://app.test:3000";
    process.env.BOBODDY_API_KEY = "boboddy-key";
  });

  afterEach(() => {
    process.env.SANDBOX_AGENT_BASE_URL = originalEnv.SANDBOX_AGENT_BASE_URL;
    process.env.SANDBOX_AGENT_REPOSITORY = originalEnv.SANDBOX_AGENT_REPOSITORY;
    process.env.SANDBOX_AGENT_TOKEN = originalEnv.SANDBOX_AGENT_TOKEN;
    process.env.APP_BASE_URL = originalEnv.APP_BASE_URL;
    process.env.BOBODDY_API_KEY = originalEnv.BOBODDY_API_KEY;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts a sandbox run request with the investigation callback target", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ runId: "run_123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const launcher = new SandboxAgentRunLauncher();

    const result = await launcher.launch({
      stepExecutionId: "step-1",
      stepName: TICKET_INVESTIGATION_STEP_NAME,
      ticketId: "CV-123",
      pipelineId: "pipe-1",
      issueNumber: 42,
      baseBranch: "ticket-cv-123-dev",
      customInstructions: "Investigate the ticket.",
      customAgent: "ticket-investigation-agent",
    });

    expect(result).toEqual({ externalRunId: "run_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://sandbox.test/agent-runs",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer sandbox-token",
        },
        body: expect.any(String),
      }),
    );

    const request = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    );
    expect(request).toMatchObject({
      repository: "owner/repo",
      stepExecutionId: "step-1",
      stepName: TICKET_INVESTIGATION_STEP_NAME,
      ticketId: "CV-123",
      pipelineId: "pipe-1",
      issueNumber: 42,
      baseBranch: "ticket-cv-123-dev",
      customAgent: "ticket-investigation-agent",
      callback: {
        url: "http://app.test:3000/api/webhooks/ticket-investigation-step-output",
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-api-key": "boboddy-key",
        },
        query: {
          stepExecutionId: "step-1",
        },
      },
    });
  });

  it("maps repro steps to the repro webhook route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const launcher = new SandboxAgentRunLauncher();

    await launcher.launch({
      stepExecutionId: "step-2",
      stepName: FAILING_TEST_REPRO_STEP_NAME,
      ticketId: "CV-124",
      pipelineId: "pipe-2",
      issueNumber: 43,
      baseBranch: "ticket-cv-124-dev",
      customInstructions: "Reproduce the bug.",
    });

    const request = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    );
    expect(request.callback.url).toBe(
      "http://app.test:3000/api/webhooks/failing-test-repro-step-output",
    );
  });
});
