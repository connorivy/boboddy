import { AppContext } from "@/lib/di";
import { type StepExecutionStatus } from "@/modules/step-executions/domain/step-execution.types";
import {
  FailingTestFixStepExecutionEntity,
  FailingTestReproStepExecutionEntity,
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionQualityStepExecutionEntity,
  TicketDuplicateCandidatesStepResultEntity,
  TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import type { PipelineStepExecutionsQuery } from "@/modules/step-executions/contracts/get-pipeline-step-executions-contracts";
import type { StepExecutionRepo } from "@/modules/step-executions/application/step-execution-repo";
import { processClaimedStepExecution } from "./process-claimed-step-execution";
import type { DbExecutor } from "@/lib/db/db-executor";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 100;

export class ClaimedExecutionStepRepo implements StepExecutionRepo {
  private hasRemappedFirstSave = false;

  constructor(
    private readonly delegate: StepExecutionRepo,
    private readonly claimedExecution: TicketPipelineStepExecutionEntity,
  ) {}

  private remapToClaimedExecution(
    stepExecution: TicketPipelineStepExecutionEntity,
  ): void {
    stepExecution.id = this.claimedExecution.id;
    stepExecution.pipelineId = this.claimedExecution.pipelineId;
    stepExecution.idempotencyKey = this.claimedExecution.idempotencyKey;
    stepExecution.createdAt = this.claimedExecution.createdAt;
    stepExecution.updatedAt = this.claimedExecution.updatedAt;
  }

  async load(id: string): Promise<TicketPipelineStepExecutionEntity | null> {
    return this.delegate.load(id);
  }

  async loadQueued(
    limit: number,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.delegate.loadQueued(limit);
  }

  async claimQueued(
    id: string,
  ): Promise<TicketPipelineStepExecutionEntity | null> {
    return this.delegate.claimQueued(id);
  }

  async loadByPipelineId(
    pipelineId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.delegate.loadByPipelineId(pipelineId);
  }

  async loadByTicketId(
    ticketId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.delegate.loadByTicketId(ticketId);
  }

  async loadPage(
    query: PipelineStepExecutionsQuery,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.delegate.loadPage(query);
  }

  async count(): Promise<number> {
    return this.delegate.count();
  }

  async save(
    stepExecution: TicketPipelineStepExecutionEntity,
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity> {
    if (!this.hasRemappedFirstSave) {
      this.remapToClaimedExecution(stepExecution);
      this.hasRemappedFirstSave = true;
    }

    return this.delegate.save(stepExecution, dbExecutor);
  }

  async saveMany(
    stepExecutions: TicketPipelineStepExecutionEntity[],
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    if (stepExecutions.length === 0) {
      return [];
    }

    if (!this.hasRemappedFirstSave) {
      this.remapToClaimedExecution(stepExecutions[0]);
      this.hasRemappedFirstSave = true;
    }

    return this.delegate.saveMany(stepExecutions, dbExecutor);
  }
}

function toExecutionWithStatus(
  execution: TicketPipelineStepExecutionEntity,
  status: StepExecutionStatus,
): TicketPipelineStepExecutionEntity {
  const endedAt = status === "running" ? undefined : new Date().toISOString();

  if (execution instanceof TicketDescriptionQualityStepExecutionEntity) {
    return new TicketDescriptionQualityStepExecutionEntity(
      execution.pipelineId,
      status,
      execution.idempotencyKey,
      execution.result,
      execution.startedAt,
      endedAt,
      execution.createdAt,
      execution.updatedAt,
      execution.id,
    );
  }

  if (execution instanceof TicketDescriptionEnrichmentStepExecutionEntity) {
    return new TicketDescriptionEnrichmentStepExecutionEntity(
      execution.pipelineId,
      status,
      execution.idempotencyKey,
      execution.result,
      execution.startedAt,
      endedAt,
      execution.createdAt,
      execution.updatedAt,
      execution.id,
    );
  }

  if (execution instanceof TicketDuplicateCandidatesStepResultEntity) {
    return new TicketDuplicateCandidatesStepResultEntity(
      execution.pipelineId,
      status,
      execution.idempotencyKey,
      execution.result,
      execution.startedAt,
      endedAt,
      execution.createdAt,
      execution.updatedAt,
      execution.id,
    );
  }

  if (execution instanceof FailingTestReproStepExecutionEntity) {
    return new FailingTestReproStepExecutionEntity(
      execution.pipelineId,
      status,
      execution.idempotencyKey,
      execution.result,
      execution.startedAt,
      endedAt,
      execution.createdAt,
      execution.updatedAt,
      execution.id,
    );
  }

  if (execution instanceof FailingTestFixStepExecutionEntity) {
    return new FailingTestFixStepExecutionEntity(
      execution.pipelineId,
      status,
      execution.idempotencyKey,
      execution.result,
      execution.startedAt,
      endedAt,
      execution.createdAt,
      execution.updatedAt,
      execution.id,
    );
  }

  throw new Error(`Unsupported step execution type '${execution.stepName}'`);
}

function parseBatchSize(rawValue: string | undefined): number {
  if (!rawValue) {
    return DEFAULT_BATCH_SIZE;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(parsed, MAX_BATCH_SIZE);
}

function parsePollIntervalMs(rawValue: string | undefined): number {
  if (!rawValue) {
    return DEFAULT_POLL_INTERVAL_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_POLL_INTERVAL_MS;
  }

  return parsed;
}

export async function resolveTicketId(pipelineId: string): Promise<string> {
  const pipelineRun = await AppContext.pipelineRunRepo.loadById(pipelineId);
  return pipelineRun?.ticketId ?? pipelineId;
}

export async function processQueuedStepExecutionsBatch(
  batchSize = parseBatchSize(process.env.WORKER_BATCH_SIZE),
): Promise<number> {
  const queuedExecutions =
    await AppContext.stepExecutionRepo.loadQueued(batchSize);
  let processedCount = 0;

  if (queuedExecutions.length === 0) {
    console.log("[worker] no queued step executions found");
    return processedCount;
  }

  for (const queuedExecution of queuedExecutions) {
    const claimedExecution = await AppContext.stepExecutionRepo.claimQueued(
      queuedExecution.id,
    );

    if (!claimedExecution) {
      continue;
    }

    try {
      await processClaimedStepExecution(claimedExecution);
      processedCount += 1;
    } catch (error) {
      const failedExecution = toExecutionWithStatus(claimedExecution, "failed");
      await AppContext.stepExecutionRepo.save(failedExecution);
      console.error(
        `[worker] failed queued step execution id=${claimedExecution.id} step=${claimedExecution.stepName}:`,
        error,
      );
    }
  }

  return processedCount;
}

export async function startQueuedStepExecutionWorker(): Promise<void> {
  const pollIntervalMs = parsePollIntervalMs(
    process.env.WORKER_POLL_INTERVAL_MS,
  );

  console.log(
    `[worker] starting queued-step-execution worker pollIntervalMs=${pollIntervalMs} batchSize=${parseBatchSize(process.env.WORKER_BATCH_SIZE)}`,
  );

  for (;;) {
    try {
      const processedCount = await processQueuedStepExecutionsBatch();
      if (processedCount > 0) {
        console.log(
          `[worker] processed ${processedCount} queued step execution(s)`,
        );
      }
    } catch (error) {
      console.error("[worker] loop error:", error);
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollIntervalMs);
    });
  }
}
