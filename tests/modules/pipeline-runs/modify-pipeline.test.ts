import { describe, expect, it } from "vitest";
import { modifyPipeline } from "@/modules/pipeline-runs/application/modify-pipeline";
import type { PipelineRunRepo } from "@/modules/pipeline-runs/application/pipeline-run-repo";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";

function createPipelineRunRepoStub(
  pipelineRun: PipelineRunEntity | null,
): PipelineRunRepo {
  let currentPipelineRun = pipelineRun;

  return {
    async loadById() {
      return currentPipelineRun;
    },
    async loadByTicketId() {
      return [];
    },
    async loadByTicketIds() {
      return new Map();
    },
    async loadPage() {
      return [];
    },
    async count() {
      return 0;
    },
    async createMany() {
      return [];
    },
    async save(savedPipelineRun) {
      currentPipelineRun = savedPipelineRun;
      return savedPipelineRun;
    },
  };
}

describe("modifyPipeline", () => {
  it("updates autoAdvance for an existing pipeline run", async () => {
    const repo = createPipelineRunRepoStub(
      new PipelineRunEntity("pipeline-1", "CV-1001", false),
    );

    const result = await modifyPipeline(
      {
        pipelineRunId: "pipeline-1",
        autoAdvance: true,
      },
      { pipelineRunRepo: repo },
    );

    expect(result).toMatchObject({
      pipelineRunId: "pipeline-1",
      ticketId: "CV-1001",
      autoAdvance: true,
      stepExecutions: null,
    });
  });

  it("throws when the pipeline run does not exist", async () => {
    const repo = createPipelineRunRepoStub(null);

    await expect(
      modifyPipeline(
        {
          pipelineRunId: "missing-pipeline",
          autoAdvance: true,
        },
        { pipelineRunRepo: repo },
      ),
    ).rejects.toMatchObject({
      message: "Pipeline run with ID missing-pipeline not found",
      status: 404,
    });
  });
});
