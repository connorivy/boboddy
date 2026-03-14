import { describe, expect, it, vi } from "vitest";
import {
  SandboxAgentService,
  type SandboxAgentRunner,
} from "@/modules/ai/infra/sandbox-agent-service";
import { FAILING_TEST_REPRO_STEP_NAME } from "@/modules/step-executions/domain/step-execution.types";

function buildRequest() {
  return {
    repository: "owner/repo",
    stepExecutionId: "step-1",
    stepName: FAILING_TEST_REPRO_STEP_NAME,
    ticketId: "CV-123",
    pipelineId: "pipeline-1",
    issueNumber: 101,
    baseBranch: "ticket-cv-123-dev",
    customInstructions: "Reproduce the bug.",
    callback: {
      url: "http://app.test/api/webhooks/failing-test-repro-step-output",
      method: "PUT" as const,
      headers: {
        "content-type": "application/json",
        "x-api-key": "secret",
      },
      query: {
        stepExecutionId: "step-1",
      },
    },
  };
}

describe("SandboxAgentService", () => {
  it("creates and completes a run through the injected runner", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue(undefined) as unknown as SandboxAgentRunner["execute"];
    const service = new SandboxAgentService({ execute });

    const response = service.createRun(buildRequest());
    expect(response.runId).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(execute).toHaveBeenCalledTimes(1);
    const run = service.getRun(response.runId as string);
    expect(run?.status).toBe("completed");
    expect(run?.request.stepExecutionId).toBe("step-1");
  });

  it("marks the run failed when the runner throws", async () => {
    const service = new SandboxAgentService({
      execute: vi.fn().mockRejectedValue(new Error("docker compose failed")),
    });

    const response = service.createRun(buildRequest());

    await new Promise((resolve) => setTimeout(resolve, 0));

    const run = service.getRun(response.runId as string);
    expect(run?.status).toBe("failed");
    expect(run?.failureReason).toContain("docker compose failed");
  });
});
