import { describe, expect, it } from "vitest";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { sandboxTaskRunnerInternals } from "@/modules/ai/infra/run-sandbox-agent-task";

describe("run-sandbox-agent-task", () => {
  it("maps step names to the expected payload paths", () => {
    expect(
      sandboxTaskRunnerInternals.getPayloadRelativePath(
        TICKET_INVESTIGATION_STEP_NAME,
      ),
    ).toBe("tmp/copilot-ticket-investigation-webhook-payload.json");
    expect(
      sandboxTaskRunnerInternals.getPayloadRelativePath(
        FAILING_TEST_REPRO_STEP_NAME,
      ),
    ).toBe("tmp/copilot-repro-webhook-payload.json");
    expect(
      sandboxTaskRunnerInternals.getPayloadRelativePath(
        FAILING_TEST_FIX_STEP_NAME,
      ),
    ).toBe("tmp/copilot-fix-webhook-payload.json");
  });

  it("builds a schema-compatible fallback fix payload", () => {
    const payload = sandboxTaskRunnerInternals.buildFallbackPayload(
      {
        repository: "owner/repo",
        stepExecutionId: "step-1",
        stepName: FAILING_TEST_FIX_STEP_NAME,
        ticketId: "CV-123",
        pipelineId: "pipeline-1",
        issueNumber: 7,
        baseBranch: "ticket-cv-123-dev",
        customInstructions: "Fix the bug.",
        callback: {
          url: "http://app.test/api/webhooks/failing-test-fix-step-output",
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-api-key": "key",
          },
          query: {
            stepExecutionId: "step-1",
          },
        },
      },
      "command failed",
    );

    expect(payload).toEqual({
      fixOperationOutcome: "agent_error",
      summaryOfFix:
        "Sandbox agent run did not produce a failing-test fix payload.",
      fixConfidenceLevel: null,
      fixedTestPath: null,
    });
  });
});
