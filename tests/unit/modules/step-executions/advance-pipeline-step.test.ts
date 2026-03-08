import { beforeEach, describe, expect, it, vi } from "vitest";
import { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-entity";
import type { PipelineRunRepo } from "@/modules/pipeline-runs/application/pipeline-run-repo";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import { TicketPipelineStepExecutionEntity } from "@/modules/step-executions/domain/step-execution-entity";
import {
  PIPELINE_STEP_ORDER,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";

let sharedStepRepo: InMemoryStepExecutionRepo;

vi.mock(
  "@/modules/step-executions/application/trigger-ticket-description-enrichment-step",
  () => ({
    triggerTicketDescriptionEnrichmentStep: vi.fn(async (input) => {
      const execution = await sharedStepRepo.save(
        new TicketPipelineStepExecutionEntity(
          input.ticketId,
          input.pipelineRunId,
          PIPELINE_STEP_ORDER[0],
          "running",
          "enrichment:run-1",
          "2026-03-01T12:00:00.000Z",
          undefined,
        ),
      );

      return {
        ok: true as const,
        data: {
          stepExecution: {
            id: execution.id!,
            ticketId: execution.ticketId,
            pipelineRunId: execution.pipelineRunId,
            stepName: execution.stepName,
            status: execution.status,
            idempotencyKey: execution.idempotencyKey,
            startedAt: execution.startedAt,
            endedAt: execution.endedAt ?? null,
            createdAt: execution.createdAt!,
            updatedAt: execution.updatedAt!,
            result: null,
          },
        },
      };
    }),
  }),
);

vi.mock(
  "@/modules/step-executions/application/trigger-ticket-description-quality-step",
  () => ({
    triggerTicketDescriptionQualityStep: vi.fn(async (input) => {
      const execution = await sharedStepRepo.save(
        new TicketPipelineStepExecutionEntity(
          input.ticketId,
          input.pipelineRunId,
          TICKET_DESCRIPTION_QUALITY_STEP_NAME,
          "running",
          "quality:run-1",
          "2026-03-01T12:01:00.000Z",
          undefined,
        ),
      );

      return {
        ok: true as const,
        data: {
          stepExecution: {
            id: execution.id!,
            ticketId: execution.ticketId,
            pipelineRunId: execution.pipelineRunId,
            stepName: execution.stepName,
            status: execution.status,
            idempotencyKey: execution.idempotencyKey,
            startedAt: execution.startedAt,
            endedAt: execution.endedAt ?? null,
            createdAt: execution.createdAt!,
            updatedAt: execution.updatedAt!,
            result: null,
          },
        },
      };
    }),
  }),
);

vi.mock("@/modules/step-executions/application/trigger-ticket-duplicate-candidates-step", () => ({
  triggerTicketDuplicateCandidatesStep: vi.fn(),
}));

vi.mock("@/modules/step-executions/application/trigger-ticket-failing-test-repro-step", () => ({
  triggerTicketFailingTestReproStep: vi.fn(),
}));

vi.mock("@/modules/step-executions/application/trigger-ticket-failing-test-fix-step", () => ({
  triggerTicketFailingTestFixStep: vi.fn(),
}));

class InMemoryStepExecutionRepo implements StepExecutionRepo {
  private executions = new Map<number, TicketPipelineStepExecutionEntity>();
  private nextId = 1;

  async load(id: number) {
    return this.executions.get(id) ?? null;
  }

  async loadByPipelineRunId(pipelineRunId: string) {
    return [...this.executions.values()]
      .filter((execution) => execution.pipelineRunId === pipelineRunId)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }

  async loadByTicketId(ticketId: string) {
    return [...this.executions.values()]
      .filter((execution) => execution.ticketId === ticketId)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }

  async loadPage() {
    return [...this.executions.values()];
  }

  async count() {
    return this.executions.size;
  }

  async save(stepExecution: TicketPipelineStepExecutionEntity) {
    const id = stepExecution.id ?? this.nextId++;
    stepExecution.id = id;
    stepExecution.createdAt ??= stepExecution.startedAt;
    stepExecution.updatedAt = stepExecution.endedAt ?? stepExecution.startedAt;
    this.executions.set(id, stepExecution);
    return stepExecution;
  }

  async loadByTicketIds() {
    return new Map();
  }
}

class InMemoryPipelineRunRepo implements PipelineRunRepo {
  private runs = new Map<string, PipelineRunEntity>();

  constructor(private readonly stepRepo: InMemoryStepExecutionRepo) {}

  async load(id: string) {
    return this.runs.get(id) ?? null;
  }

  async loadLatestOrActiveByTicketId(ticketId: string) {
    return [...this.runs.values()]
      .filter((run) => run.ticketId === ticketId)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0] ?? null;
  }

  async loadPage() {
    return [...this.runs.values()];
  }

  async count() {
    return this.runs.size;
  }

  async loadExecutions(pipelineRunId: string) {
    return this.stepRepo.loadByPipelineRunId(pipelineRunId);
  }

  async save(run: PipelineRunEntity) {
    run.createdAt ??= run.startedAt;
    run.updatedAt = run.endedAt ?? run.startedAt;
    this.runs.set(run.id, run);
    return run;
  }
}

describe("advancePipelineStep", () => {
  beforeEach(() => {
    sharedStepRepo = new InMemoryStepExecutionRepo();
  });

  it("starts the first pipeline step when the run has no executions", async () => {
    const { advancePipelineStep } = await import(
      "@/modules/step-executions/application/advance-pipeline-step"
    );
    const pipelineRunRepo = new InMemoryPipelineRunRepo(sharedStepRepo);

    const result = await advancePipelineStep(
      { ticketId: "CV-700" },
      {
        ticketRepo: {
          loadById: vi.fn().mockResolvedValue({ id: "CV-700", ticketNumber: "CV-700" }),
        } as never,
        stepExecutionRepo: sharedStepRepo,
        pipelineRunRepo,
        ticketVectorRepo: {} as never,
        ticketGitEnvironmentRepo: {} as never,
        githubService: {} as never,
      },
    );

    expect(result.data.pipeline.status).toBe("waiting");
    expect(result.data.pipeline.currentStepName).toBe(PIPELINE_STEP_ORDER[0]);
    expect(result.data.pipeline.stepExecutions).toHaveLength(1);
    expect(result.data.pipeline.stepExecutions[0]?.pipelineRunId).toBe(
      result.data.pipeline.pipelineRunId,
    );
  });

  it("does not advance when the latest execution is still running", async () => {
    const { advancePipelineStep } = await import(
      "@/modules/step-executions/application/advance-pipeline-step"
    );
    const pipelineRunRepo = new InMemoryPipelineRunRepo(sharedStepRepo);
    await pipelineRunRepo.save(
      new PipelineRunEntity(
        "pipeline-run-running",
        "CV-701",
        "running",
        PIPELINE_STEP_ORDER[0],
        1,
        null,
        null,
        "2026-03-01T12:00:00.000Z",
      ),
    );
    await sharedStepRepo.save(
      new TicketPipelineStepExecutionEntity(
        "CV-701",
        "pipeline-run-running",
        PIPELINE_STEP_ORDER[0],
        "running",
        "enrichment:running",
        "2026-03-01T12:00:00.000Z",
        undefined,
        1,
      ),
    );

    const result = await advancePipelineStep(
      { ticketId: "CV-701", pipelineRunId: "pipeline-run-running" },
      {
        ticketRepo: {
          loadById: vi.fn().mockResolvedValue({ id: "CV-701", ticketNumber: "CV-701" }),
        } as never,
        stepExecutionRepo: sharedStepRepo,
        pipelineRunRepo,
        ticketVectorRepo: {} as never,
        ticketGitEnvironmentRepo: {} as never,
        githubService: {} as never,
      },
    );

    expect(result.data.pipeline.status).toBe("waiting");
    expect(result.data.pipeline.currentStepName).toBe(PIPELINE_STEP_ORDER[0]);
    expect(result.data.pipeline.stepExecutions).toHaveLength(1);
  });

  it("halts the run when the latest execution is waiting for user feedback", async () => {
    const { advancePipelineStep } = await import(
      "@/modules/step-executions/application/advance-pipeline-step"
    );
    const pipelineRunRepo = new InMemoryPipelineRunRepo(sharedStepRepo);
    await pipelineRunRepo.save(
      new PipelineRunEntity(
        "pipeline-run-halted",
        "CV-702",
        "running",
        PIPELINE_STEP_ORDER[3],
        1,
        PIPELINE_STEP_ORDER[2],
        null,
        "2026-03-01T12:00:00.000Z",
      ),
    );
    await sharedStepRepo.save(
      new TicketPipelineStepExecutionEntity(
        "CV-702",
        "pipeline-run-halted",
        PIPELINE_STEP_ORDER[3],
        "waiting_for_user_feedback",
        "repro:waiting",
        "2026-03-01T12:00:00.000Z",
        undefined,
        1,
      ),
    );

    const result = await advancePipelineStep(
      { ticketId: "CV-702", pipelineRunId: "pipeline-run-halted" },
      {
        ticketRepo: {
          loadById: vi.fn().mockResolvedValue({ id: "CV-702", ticketNumber: "CV-702" }),
        } as never,
        stepExecutionRepo: sharedStepRepo,
        pipelineRunRepo,
        ticketVectorRepo: {} as never,
        ticketGitEnvironmentRepo: {} as never,
        githubService: {} as never,
      },
    );

    expect(result.data.pipeline.status).toBe("halted");
    expect(result.data.pipeline.haltReason).toContain("waiting for user feedback");
  });
});
