import type { UuidV7 } from "../../lib/uuid-v7";
import { resolveProjectWorkLogger } from "./process-project-work-logger";
import type {
  ProcessProjectWorkDeps,
  StepExecutionWorkerClient,
} from "./process-project-work.types";

function getHeartbeatPollDelayMs(leaseDurationSeconds: number) {
  return Math.max(1_000, Math.floor((leaseDurationSeconds * 1_000) / 2));
}

export function createStepExecutionHeartbeatController(
  client: StepExecutionWorkerClient,
  deps: Pick<ProcessProjectWorkDeps, "sleep" | "logger">,
  input: {
    stepExecutionId: UuidV7;
    claimToken: string;
    leaseDurationSeconds: number;
  },
) {
  const logger = resolveProjectWorkLogger(deps);
  const pollDelayMs = getHeartbeatPollDelayMs(input.leaseDurationSeconds);

  logger.log("heartbeat", "Starting heartbeat loop", {
    stepExecutionId: input.stepExecutionId,
    leaseDurationSeconds: input.leaseDurationSeconds,
    pollDelayMs,
  });

  let resolveStopSignal: (() => void) | null = null;
  const stopSignal = new Promise<void>((resolve) => {
    resolveStopSignal = resolve;
  });
  let activePollTimeout: ReturnType<typeof setTimeout> | null = null;

  function waitForNextPoll(): Promise<void> {
    return new Promise((resolve) => {
      activePollTimeout = setTimeout(() => {
        activePollTimeout = null;
        resolve();
      }, pollDelayMs);
    });
  }

  const runLoop = (async () => {
    for (;;) {
      const shouldStop = await Promise.race([
        waitForNextPoll().then(() => false),
        stopSignal.then(() => true),
      ]);
      if (shouldStop) {
        return;
      }

      try {
        logger.log("heartbeat", "Sending heartbeat", {
          stepExecutionId: input.stepExecutionId,
          leaseDurationSeconds: input.leaseDurationSeconds,
        });
        await client.heartbeatStepExecution({
          stepExecutionId: input.stepExecutionId,
          claimToken: input.claimToken,
          leaseDurationSeconds: input.leaseDurationSeconds,
        });
        logger.log("heartbeat", "Heartbeat accepted", {
          stepExecutionId: input.stepExecutionId,
        });
      } catch (error) {
        logger.error("heartbeat", "Heartbeat failed", {
          stepExecutionId: input.stepExecutionId,
          error,
        });
      }
    }
  })();

  return {
    async stop() {
      logger.log("heartbeat", "Stopping heartbeat loop", {
        stepExecutionId: input.stepExecutionId,
      });
      if (activePollTimeout !== null) {
        clearTimeout(activePollTimeout);
        activePollTimeout = null;
      }
      resolveStopSignal?.();
      await runLoop;
      logger.log("heartbeat", "Heartbeat loop stopped", {
        stepExecutionId: input.stepExecutionId,
      });
    },
  };
}
