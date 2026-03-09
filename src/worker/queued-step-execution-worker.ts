import { AppContext } from "@/lib/di";
import { executeQueuedStepExecution } from "@/modules/step-executions/application/execute-queued-step-execution";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 100;

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
    try {
      const result = await executeQueuedStepExecution({
        stepExecutionId: queuedExecution.id,
      });
      if (result.data.stepExecution) {
        processedCount += 1;
      }
    } catch (error) {
      console.error(
        `[worker] failed queued step execution id=${queuedExecution.id} step=${queuedExecution.stepName} reason=${queuedExecution.failureReason}:`,
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
