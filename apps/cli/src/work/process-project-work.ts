import os, { hostname } from "node:os";
import path from "node:path";
import { parseUuidV7 } from "../lib/uuid-v7";
import type { RuntimeCommandRunner } from "../runtime/application/runtime-command-runner";
import { systemTimeProvider } from "../lib/time-provider";
import type { TimeProvider } from "../lib/time-provider";
import { LocalArtifactStore } from "../artifacts/local-artifact-store";
import { LocalRuntimeCommandRunner } from "../runtime/infra/local-runtime-command-runner";
import { LocalDevcontainerPortForwardManager } from "../runtime/infra/local-devcontainer-port-forward-manager";
import type { RuntimeServiceRunner } from "../runtime/application/runtime-service-runner";
import { LocalRuntimeServiceRunner } from "../runtime/infra/local-runtime-service-runner";
import {
  processProjectWork as processProjectWorkInCore,
  type ProcessProjectWorkResult,
  type ProjectWorkLogger,
  type StepExecutionAgentRunner,
  type StepExecutionRunTracker,
  type StepExecutionRuntimeEnvironmentOrchestrator,
  type StepExecutionWorkerClient,
} from "./engine/process-project-work";
import { resolveBoboddyBaseUrl } from "../auth/config";
import { cliLogger } from "../lib/logger";
import {
  type LocalRuntimeSessionStore,
  SqliteLocalRuntimeSessionStore,
} from "./local-runtime-session-store";
import {
  DefaultLocalProjectRuntimeEnvironmentOrchestrator,
} from "./local-project-runtime-environment";
import { DefaultOpencodeStepRunner } from "./opencode-step-runner";
import { createStepExecutionPlaneWorkerClient } from "./worker-api-client";
import { logWork, logWorkError } from "./work-logger";

const DEFAULT_WORK_CONCURRENCY = 1;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_LEASE_DURATION_SECONDS = 30;

export type ProcessProjectWorkOptions = {
  projectId: string;
  baseUrl?: string | undefined;
  batchSize?: number | undefined;
  concurrency?: number | undefined;
  pollIntervalMs?: number | undefined;
  leaseDurationSeconds?: number | undefined;
  workerId?: string | undefined;
  workItemId?: string | undefined;
  preserveRuntimeOnComplete?: boolean | undefined;
  once?: boolean | undefined;
};

export type ProcessProjectWorkDeps = {
  createWorkerClient(baseUrl: string): Promise<StepExecutionWorkerClient>;
  createRunTracker(): StepExecutionRunTracker;
  runtimeEnvironmentOrchestrator: StepExecutionRuntimeEnvironmentOrchestrator;
  agentRunner: StepExecutionAgentRunner;
  runtimeCommandRunner: RuntimeCommandRunner;
  runtimeServiceRunner: RuntimeServiceRunner;
  timeProvider: TimeProvider;
  sleep(milliseconds: number): Promise<void>;
  logger: ProjectWorkLogger;
};

function loadDefaultDeps(): ProcessProjectWorkDeps {
  return {
    createWorkerClient: createStepExecutionPlaneWorkerClient,
    createRunTracker: () => new SqliteLocalRuntimeSessionStore(),
    runtimeEnvironmentOrchestrator:
      new DefaultLocalProjectRuntimeEnvironmentOrchestrator(),
    agentRunner: new DefaultOpencodeStepRunner(),
    runtimeCommandRunner: new LocalRuntimeCommandRunner(
      cliLogger.child({ scope: "runtime-command-runner" }),
    ),
    runtimeServiceRunner: new LocalRuntimeServiceRunner(
      new LocalDevcontainerPortForwardManager(),
      cliLogger.child({ scope: "runtime-service-runner" }),
    ),
    timeProvider: systemTimeProvider,
    sleep: (milliseconds) =>
      new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
      }),
    logger: {
      log: (scope, message, details) => {
        logWork(scope, message, details);
      },
      error: (scope, message, details) => {
        logWorkError(scope, message, details);
      },
    },
  };
}

function parsePositiveInt(
  value: string | number | undefined,
  fallback: number,
): number {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

function resolveConcurrency(value?: number  ): number {
  return parsePositiveInt(
    value ?? process.env["BOBODDY_WORK_CONCURRENCY"],
    DEFAULT_WORK_CONCURRENCY,
  );
}

function resolvePollIntervalMs(value?: number  ): number {
  return parsePositiveInt(
    value ?? process.env["BOBODDY_WORK_POLL_INTERVAL_MS"],
    DEFAULT_POLL_INTERVAL_MS,
  );
}

function resolveLeaseDurationSeconds(value?: number  ): number {
  return parsePositiveInt(
    value ?? process.env["BOBODDY_WORK_LEASE_DURATION_SECONDS"],
    DEFAULT_LEASE_DURATION_SECONDS,
  );
}

function resolveWorkerId(projectId: string, workerId?: string  ) {
  const normalizedWorkerId = workerId?.trim();

  if (normalizedWorkerId) {
    return normalizedWorkerId;
  }

  return `boboddy-work-${hostname()}-${String(process.pid)}-${projectId}`;
}

export async function processProjectWork(
  options: ProcessProjectWorkOptions,
  deps?: ProcessProjectWorkDeps,
): Promise<ProcessProjectWorkResult> {
  const resolvedDeps = deps ?? loadDefaultDeps();
  const projectId = parseUuidV7(options.projectId);
  const baseUrl = resolveBoboddyBaseUrl(options.baseUrl);
  const workerClient = await resolvedDeps.createWorkerClient(baseUrl);
  const concurrency = resolveConcurrency(options.concurrency);
  const pollIntervalMs = resolvePollIntervalMs(options.pollIntervalMs);
  const leaseDurationSeconds = resolveLeaseDurationSeconds(
    options.leaseDurationSeconds,
  );
  const batchSize = parsePositiveInt(options.batchSize, concurrency);
  const workerId = resolveWorkerId(projectId, options.workerId);

  const artifactStore = new LocalArtifactStore(
    path.join(os.homedir(), ".boboddy", "artifacts"),
  );

  return await processProjectWorkInCore(
    {
      projectId,
      workerId,
      batchSize,
      concurrency,
      pollIntervalMs,
      leaseDurationSeconds,
      workItemId: options.workItemId,
      preserveRuntimeOnComplete: options.preserveRuntimeOnComplete,
      once: options.once,
    },
    {
      workerClient,
      createRunTracker: () => resolvedDeps.createRunTracker(),
      runtimeEnvironmentOrchestrator:
        resolvedDeps.runtimeEnvironmentOrchestrator,
      agentRunner: resolvedDeps.agentRunner,
      artifactStore,
      runtimeCommandRunner: resolvedDeps.runtimeCommandRunner,
      runtimeServiceRunner: resolvedDeps.runtimeServiceRunner,
      timeProvider: resolvedDeps.timeProvider,
      sleep: (milliseconds) => resolvedDeps.sleep(milliseconds),
      logger: {
        log: (scope, message, details) => {
          resolvedDeps.logger.log(scope, message, details);
        },
        error: (scope, message, details) => {
          resolvedDeps.logger.error(scope, message, details);
        },
      },
    },
  );
}

export type { ProcessProjectWorkResult };
export type { LocalRuntimeSessionStore };
