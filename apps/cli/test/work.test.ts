import { afterEach, describe, expect, vi } from "bun:test";
import { parseUuidV7 } from "@boboddy/core/common/contracts/uuid-v7";
import type {
  StepExecutionAgentRunner,
  StepExecutionRunTracker,
  StepExecutionRuntimeEnvironmentOrchestrator,
  StepExecutionWorkerClient,
  StepExecutionWorkerContext,
} from "@boboddy/core/pipeline-executions/step-execution/application/process-project-work";
import { processProjectWork } from "../src/work/process-project-work";
import { concurrentTest } from "./utils";

const projectId = "01966a2c-9494-7db5-aa46-0f8f5cbbe001";
const userId = parseUuidV7("01966a2c-9494-7db5-aa46-0f8f5cbbe002");
const stepExecutionId = parseUuidV7("01966a2c-9494-7db5-aa46-0f8f5cbbe004");

function createRunTracker(): StepExecutionRunTracker {
  return {
    createSession: vi.fn(),
    markRunning: vi.fn(),
    attachAgentSession: vi.fn(),
    markSucceeded: vi.fn(),
    markFailed: vi.fn(),
    close: vi.fn(),
  };
}

function createWorkerClient(
  overrides?: Partial<StepExecutionWorkerClient>,
): StepExecutionWorkerClient {
  return {
    userId,
    claimStepExecutions: vi.fn(async () => []),
    heartbeatStepExecution: vi.fn(async () => undefined),
    failStepExecution: vi.fn(async () => undefined),
    completeStepExecution: vi.fn(async () => undefined),
    getStepExecution: vi.fn(async () => ({ status: "succeeded" as const })),
    getStepExecutionWorkerContext: vi.fn(async () =>
      ({
      projectId: parseUuidV7(projectId),
      gitUrl: "https://github.com/example/repo.git",
      requestedBranch: null,
      stepExecution: {
        id: stepExecutionId,
        status: "running",
        inputJson: null,
        executionTimeoutSeconds: 120,
      },
      stepDefinition: {
        id: parseUuidV7("01966a2c-9494-7db5-aa46-0f8f5cbbe003"),
        key: "demo-step",
        name: "Demo Step",
        prompt: "Run the demo step.",
        resultSchemaJson: { type: "object" },
      },
      agentPrompt: {
        sessionTitle: "Demo Step",
        promptText: "Run it.",
      },
    }) satisfies StepExecutionWorkerContext),
    ...overrides,
  };
}

describe("CLI processProjectWork", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  concurrentTest("resolves the base URL and default worker settings before delegating to core", async () => {
    const workerClient = createWorkerClient();
    const createWorkerClientForBaseUrl = vi.fn(async () => workerClient);

    const result = await processProjectWork(
      {
        projectId,
        baseUrl: "https://example.com///",
        once: true,
      },
      {
        createWorkerClient: createWorkerClientForBaseUrl,
        createRunTracker,
        runtimeEnvironmentOrchestrator: {
          launch: vi.fn(async () => {
            throw new Error("Not used");
          }),
        } satisfies StepExecutionRuntimeEnvironmentOrchestrator,
        agentRunner: {
          promptAsync: vi.fn(async () => {
            throw new Error("Not used");
          }),
        } satisfies StepExecutionAgentRunner,
        sleep: async () => undefined,
        logger: {
          log: vi.fn(),
          error: vi.fn(),
        },
      },
    );

    expect(createWorkerClientForBaseUrl).toHaveBeenCalledWith(
      "https://example.com",
    );
    expect(workerClient.claimStepExecutions).toHaveBeenCalledWith({
      projectId: parseUuidV7(projectId),
      workerId: expect.stringContaining(`-${projectId}`),
      batchSize: 1,
      leaseDurationSeconds: 30,
    });
    expect(result).toEqual({
      claimedCount: 0,
      processedCount: 0,
      skippedCount: 0,
    });
  });

  concurrentTest("uses concurrency as the default batch size when batch size is omitted", async () => {
    const workerClient = createWorkerClient();

    await processProjectWork(
      {
        projectId,
        concurrency: 2,
        workerId: "worker-2",
        once: true,
      },
      {
        createWorkerClient: async () => workerClient,
        createRunTracker,
        runtimeEnvironmentOrchestrator: {
          launch: vi.fn(async () => {
            throw new Error("Not used");
          }),
        } satisfies StepExecutionRuntimeEnvironmentOrchestrator,
        agentRunner: {
          promptAsync: vi.fn(async () => {
            throw new Error("Not used");
          }),
        } satisfies StepExecutionAgentRunner,
        sleep: async () => undefined,
        logger: {
          log: vi.fn(),
          error: vi.fn(),
        },
      },
    );

    expect(workerClient.claimStepExecutions).toHaveBeenCalledWith({
      projectId: parseUuidV7(projectId),
      workerId: "worker-2",
      batchSize: 2,
      leaseDurationSeconds: 30,
    });
  });

  concurrentTest("uses localhost:3000 as the default base URL when no base URL is configured", async () => {
    const workerClient = createWorkerClient();
    const createWorkerClientForBaseUrl = vi.fn(async () => workerClient);
    const previousBaseUrl = process.env["BOBODDY_BASE_URL"];

    delete process.env["BOBODDY_BASE_URL"];

    try {
      await processProjectWork(
        {
          projectId,
          once: true,
        },
        {
          createWorkerClient: createWorkerClientForBaseUrl,
          createRunTracker,
          runtimeEnvironmentOrchestrator: {
            launch: vi.fn(async () => {
              throw new Error("Not used");
            }),
          } satisfies StepExecutionRuntimeEnvironmentOrchestrator,
          agentRunner: {
            promptAsync: vi.fn(async () => {
              throw new Error("Not used");
            }),
          } satisfies StepExecutionAgentRunner,
          sleep: async () => undefined,
          logger: {
            log: vi.fn(),
            error: vi.fn(),
          },
        },
      );
    } finally {
      if (previousBaseUrl === undefined) {
        delete process.env["BOBODDY_BASE_URL"];
      } else {
        process.env["BOBODDY_BASE_URL"] = previousBaseUrl;
      }
    }

    expect(createWorkerClientForBaseUrl).toHaveBeenCalledWith(
      "http://localhost:3000",
    );
  });
});
