import { describe, expect, test, vi } from "bun:test";
import { processProjectWork } from "../src/work/process-project-work";

describe("processProjectWork", () => {
  test("claims and processes queued work for the provided project", async () => {
    const claimStepExecutionsMock = vi.fn(async () => [
      {
        stepExecution: { id: "step-1" },
        claimToken: "claim-1",
      },
      {
        stepExecution: { id: "step-2" },
        claimToken: "claim-2",
      },
    ]);

    const result = await processProjectWork(
      {
        projectId: "01966a2c-9494-7db5-aa46-0f8f5cbbe001",
        batchSize: 2,
        leaseDurationSeconds: 45,
        workerId: "worker-1",
      },
      {
        claimStepExecutions: claimStepExecutionsMock as never,
        appContext: {
          stepExecutionRepo: {},
          stepDefinitionRepo: {},
          linearPipelineDefinitionRepo: {},
          linearPipelineExecutionRepo: {},
          timeProvider: {},
        } as never,
      },
    );

    expect(claimStepExecutionsMock).toHaveBeenCalledWith(
      {
        projectId: "01966a2c-9494-7db5-aa46-0f8f5cbbe001",
        workerId: "worker-1",
        batchSize: 2,
        leaseDurationSeconds: 45,
      },
      expect.any(Object),
    );
    expect(result).toEqual({
      claimedCount: 2,
      processedCount: 2,
      skippedCount: 0,
    });
  });
});
