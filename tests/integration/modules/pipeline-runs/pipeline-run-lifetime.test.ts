import { CreatePipelineRunRequest } from "@/modules/pipeline-runs/contracts/pipeline-run-contracts";
import { describe, it } from "vitest";

describe("Pipeline Run Lifetime", () => {
  it("marks the failing-test execution as succeeded and stores webhook output", async () => {
    const request: CreatePipelineRunRequest = {
      pipelineRunId: "test-pipeline-run-id",
      ticketId: "test-ticket-id",
    };

  });
});
