import { CreatePipelineRunRequest } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { describe, it } from "vitest";

describe("Pipeline Run Lifetime", () => {
  it("marks the failing-test execution as succeeded and stores webhook output", async () => {
    const request: CreatePipelineRunRequest = {
      pipelineRunId: "test-pipeline-run-id",
      ticketId: "test-ticket-id",
      status: "running",
      currentStepName: "failing-test",
      currentStepExecutionId: "018f47ac-7f5a-7cc1-b54a-6f91d5b8e123",
      lastCompletedStepName: "setup",
      haltReason: null,
      startedAt: new Date().toISOString(),
    };

  });
});
