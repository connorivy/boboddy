import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { TimeProvider } from "../../../lib/time-provider";
import type { UuidV7 } from "../../../common/contracts/uuid-v7";
import { createUuidV7 } from "../../../common/contracts/uuid-v7";
import { CoreValidationError } from "../../../lib/errors";
import { createProjectRuntimeSessionExecutionTarget } from "../../../runtime/runtime-service/domain/project-runtime-session-execution-target";
import type { RuntimeCommandRunner } from "../../../runtime/runtime-service/application/runtime-command-runner";
import { summarizeRuntimeCommandOutput } from "../../../runtime/runtime-service/application/runtime-command-output-summary";
import type { RuntimeServiceRunner } from "../../../runtime/runtime-service/application/runtime-service-runner";
import { RuntimeServiceEntity } from "../../../runtime/runtime-service/domain/runtime-service-entity";
import { setProjectOpencodeRuntimeMetadata } from "./project-opencode-runtime-metadata";
import {
  PROJECT_OPENCODE_CONFIG_RELATIVE_PATH,
  type ProjectOpencodeConfig,
} from "../domain/project-opencode-config";
import { loadProjectOpencodeConfig } from "./project-opencode-config-loader";
import {
  getProjectOpencodeRuntimeRequestPaths,
  writeProjectOpencodeRuntimeResponse,
  createProjectOpencodeRuntimeResponse,
  type ProjectOpencodeArbitraryCommandResult,
} from "./project-opencode-runtime-requests";

const OUTPUT_CAP_BYTES = 100 * 1024;

// The AI agent container mounts workspacePath at /workspace. The AI computes
// paths relative to the container root (/) rather than /workspace, so it sends
// "workspace/apps/next" instead of "apps/next". Strip that prefix so the host
// can correctly join the relative path with workspacePath.
function normalizeAgentDir(dir: string): string {
  if (dir.startsWith("/workspace/")) return dir.slice("/workspace/".length);
  if (dir === "/workspace") return ".";
  if (dir.startsWith("workspace/")) return dir.slice("workspace/".length);
  if (dir === "workspace") return ".";
  return dir;
}

async function readCommandOutput(outputPath: string): Promise<{ stdout: string; stderr: string }> {
  const raw = await readFile(outputPath, "utf8").catch(() => "");
  let stdout = "";
  let stderr = "";
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line) as { stream: "stdout" | "stderr"; chunk: string };
      if (entry.stream === "stdout") stdout += entry.chunk;
      else stderr += entry.chunk;
    } catch {
      // skip malformed lines
    }
  }
  if (Buffer.byteLength(stdout, "utf8") > OUTPUT_CAP_BYTES) {
    stdout = Buffer.from(stdout, "utf8").subarray(-OUTPUT_CAP_BYTES).toString("utf8");
  }
  if (Buffer.byteLength(stderr, "utf8") > OUTPUT_CAP_BYTES) {
    stderr = Buffer.from(stderr, "utf8").subarray(-OUTPUT_CAP_BYTES).toString("utf8");
  }
  return { stdout, stderr };
}

const createExecutionTarget = (input: {
  workspacePath: string;
  devcontainerConfigPath: string;
  devcontainerId: string;
  aiContainerId: string;
}) =>
  createProjectRuntimeSessionExecutionTarget({
    environmentRole: "project",
    runnerAssignment: "local:runner:step-execution",
    environmentRef: "local:project:step-execution",
    metadata: {
      localExecution: {
        workspacePath: input.workspacePath,
        devcontainerConfigPath: input.devcontainerConfigPath,
        agentContainerId: input.aiContainerId,
        containerId: input.devcontainerId,
      },
    },
  });

export class ProjectOpencodeRuntimeActions {
  private readonly startedServices = new Map<string, RuntimeServiceEntity>();
  private readonly completedCommands = new Set<string>();
  private readonly runningProcesses = new Map<string, { kill: () => void }>();

  constructor(
    private readonly deps: {
      runtimeCommandRunner: RuntimeCommandRunner;
      runtimeServiceRunner: RuntimeServiceRunner;
      timeProvider: TimeProvider;
    },
  ) {}

  async listDefinitions(workspacePath: string) {
    const { config } = await loadProjectOpencodeConfig(workspacePath);
    if (!config) {
      throw new CoreValidationError(
        `No project OpenCode config found at ${PROJECT_OPENCODE_CONFIG_RELATIVE_PATH}`,
        "PROJECT_OPENCODE_CONFIG_NOT_FOUND",
      );
    }

    return {
      relativePath: PROJECT_OPENCODE_CONFIG_RELATIVE_PATH,
      commands: config.commands.map((command) => ({
        name: command.name,
        description: command.description,
        cwd: command.cwd,
      })),
      services: config.services.map((service) => ({
        name: service.name,
        description: service.description,
        cwd: service.cwd,
        dependsOn: [...service.dependsOn],
        expose: {
          targetPort: service.expose.targetPort,
          protocol: service.expose.protocol,
        },
      })),
    };
  }

  async runCommand(input: {
    workspacePath: string;
    devcontainerConfigPath: string;
    devcontainerId: string;
    aiContainerId: string;
    commandName: string;
  }) {
    const config = await this.loadRequiredConfig(input.workspacePath);
    const command = config.getCommand(input.commandName);
    if (!command) {
      throw new CoreValidationError(
        `Unknown project OpenCode command: ${input.commandName}`,
        "PROJECT_OPENCODE_COMMAND_NOT_FOUND",
      );
    }

    const executionTarget = createExecutionTarget(input);
    const metadata = setProjectOpencodeRuntimeMetadata({
      metadata: {},
      definitionKind: "command",
      definitionName: command.name,
      definitionDescription: command.description,
      cwd: command.cwd,
    });
    const outcome = await this.deps.runtimeCommandRunner.executeOneShot({
      command: command.run,
      executionTarget,
      metadata,
    });
    this.completedCommands.add(command.name);
    const output = summarizeRuntimeCommandOutput(outcome.output);

    return {
      commandName: command.name,
      description: command.description,
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      stdoutPreview: output.stdoutPreview,
      stderrPreview: output.stderrPreview,
    };
  }

  async ensureService(input: {
    workspacePath: string;
    devcontainerConfigPath: string;
    devcontainerId: string;
    aiContainerId: string;
    serviceName: string;
    projectId: UuidV7;
    projectRuntimeSessionId: UuidV7;
  }) {
    const existingService = this.startedServices.get(input.serviceName);
    if (existingService?.status === "ready") {
      return this.toServiceAccess(existingService);
    }

    const config = await this.loadRequiredConfig(input.workspacePath);
    const service = config.getService(input.serviceName);
    if (!service) {
      throw new CoreValidationError(
        `Unknown project OpenCode service: ${input.serviceName}`,
        "PROJECT_OPENCODE_SERVICE_NOT_FOUND",
      );
    }

    for (const dependency of config.getServiceCommandDependencies(service.name)) {
      if (this.completedCommands.has(dependency.name)) {
        continue;
      }
      const dependencyResult = await this.runCommand({
        workspacePath: input.workspacePath,
        devcontainerConfigPath: input.devcontainerConfigPath,
        devcontainerId: input.devcontainerId,
        aiContainerId: input.aiContainerId,
        commandName: dependency.name,
      });
      if (dependencyResult.exitCode !== 0 || dependencyResult.signal !== null) {
        throw new Error(
          `Runtime service dependency command "${dependency.name}" failed before starting service "${service.name}" (exitCode=${String(dependencyResult.exitCode)}, signal=${dependencyResult.signal ?? "none"})`,
        );
      }
    }

    const executionTarget = createExecutionTarget(input);
    const metadata = setProjectOpencodeRuntimeMetadata({
      metadata: {},
      definitionKind: "service",
      definitionName: service.name,
      definitionDescription: service.description,
      cwd: service.cwd,
    });
    const now = this.deps.timeProvider.now();
    const queuedService = RuntimeServiceEntity.createQueued({
      id: createUuidV7(),
      projectId: input.projectId,
      projectRuntimeSessionId: input.projectRuntimeSessionId,
      environmentRole: "project",
      command: service.run,
      healthcheck: {
        protocolKind: service.healthcheck.protocol,
        targetPort: service.expose.targetPort,
        path: service.healthcheck.path,
        expectedStatus: service.healthcheck.expectedStatus,
        intervalMs: 500,
        timeoutMs: 1_000,
        retries: 20,
      },
      metadata,
      createdAt: now,
      updatedAt: now,
      runtimeSessionIsActive: true,
    });
    const startingService = queuedService.markStarting({ startedAt: now });
    const startResult = await this.deps.runtimeServiceRunner.start({
      runtimeService: startingService,
      executionTarget,
    });
    const readyService = startingService.markReady({
      readyAt: startResult.readyAt,
      accessPoints: startResult.accessPoints,
      metadata: {
        ...metadata,
        ...(startResult.metadata ?? {}),
      },
    });

    this.startedServices.set(service.name, readyService);
    return this.toServiceAccess(readyService);
  }

  startArbitraryCommand(input: {
    workspacePath: string;
    devcontainerConfigPath: string;
    devcontainerId: string;
    aiContainerId: string;
    requestId: string;
    command: string;
    dir: string;
    timeoutMs: number;
  }): void {
    const executionTarget = createExecutionTarget(input);
    const resolvedDir = path.join(input.workspacePath, normalizeAgentDir(input.dir));
    const { outputPath } = getProjectOpencodeRuntimeRequestPaths({
      workspacePath: input.workspacePath,
      requestId: input.requestId,
    });
    const metadata = setProjectOpencodeRuntimeMetadata({
      metadata: {},
      definitionKind: "command",
      definitionName: input.requestId,
      definitionDescription: input.command,
      cwd: resolvedDir,
    });

    const abortController = new AbortController();

    const writeResponse = async (result: ProjectOpencodeArbitraryCommandResult) => {
      await writeProjectOpencodeRuntimeResponse({
        workspacePath: input.workspacePath,
        requestId: input.requestId,
        response: createProjectOpencodeRuntimeResponse({ ok: true, data: result }),
      });
    };

    this.runningProcesses.set(input.requestId, {
      kill: () => { abortController.abort(); },
    });

    const executionPromise = this.deps.runtimeCommandRunner.executeOneShot({
      command: input.command,
      executionTarget,
      metadata,
      signal: abortController.signal,
      onOutput: ({ stream, chunk }) => {
        void appendFile(outputPath, `${JSON.stringify({ stream, chunk })}\n`, "utf8");
      },
    });

    const timeoutHandle = setTimeout(() => {
      if (!this.runningProcesses.has(input.requestId)) return;
      void readCommandOutput(outputPath).then((output) => {
        void writeResponse({
          status: "running",
          commandId: input.requestId,
          exitCode: null,
          signal: null,
          ...output,
        });
      });
    }, input.timeoutMs);

    executionPromise.then(async (outcome) => {
      clearTimeout(timeoutHandle);
      const wasRunning = this.runningProcesses.has(input.requestId);
      this.runningProcesses.delete(input.requestId);
      const output = await readCommandOutput(outputPath);
      await writeResponse({
        status: wasRunning ? "exited" : "cancelled",
        commandId: input.requestId,
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        ...output,
      });
    }).catch(async (error: unknown) => {
      clearTimeout(timeoutHandle);
      this.runningProcesses.delete(input.requestId);
      await writeProjectOpencodeRuntimeResponse({
        workspacePath: input.workspacePath,
        requestId: input.requestId,
        response: createProjectOpencodeRuntimeResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      });
    });
  }

  cancelArbitraryCommand(targetId: string): boolean {
    const entry = this.runningProcesses.get(targetId);
    if (!entry) return false;
    entry.kill();
    this.runningProcesses.delete(targetId);
    return true;
  }

  cleanupRunningProcesses(): void {
    for (const entry of this.runningProcesses.values()) {
      entry.kill();
    }
    this.runningProcesses.clear();
  }

  private async loadRequiredConfig(
    workspacePath: string,
  ): Promise<ProjectOpencodeConfig> {
    const { config } = await loadProjectOpencodeConfig(workspacePath);
    if (!config) {
      throw new CoreValidationError(
        `No project OpenCode config found at ${PROJECT_OPENCODE_CONFIG_RELATIVE_PATH}`,
        "PROJECT_OPENCODE_CONFIG_NOT_FOUND",
      );
    }

    return config;
  }

  private toServiceAccess(runtimeService: RuntimeServiceEntity) {
    const accessPoint = runtimeService.accessPoints[0];
    if (!accessPoint) {
      throw new CoreValidationError(
        `Service ${runtimeService.id} is missing an access point`,
        "PROJECT_OPENCODE_SERVICE_ACCESS_POINT_MISSING",
      );
    }

    const metadata = runtimeService.metadata;
    const description =
      typeof metadata["projectOpencode"] === "object" &&
      metadata["projectOpencode"] !== null &&
      !Array.isArray(metadata["projectOpencode"]) &&
      typeof metadata["projectOpencode"]["definitionDescription"] === "string"
        ? metadata["projectOpencode"]["definitionDescription"]
        : runtimeService.command;
    const name =
      typeof metadata["projectOpencode"] === "object" &&
      metadata["projectOpencode"] !== null &&
      !Array.isArray(metadata["projectOpencode"]) &&
      typeof metadata["projectOpencode"]["definitionName"] === "string"
        ? metadata["projectOpencode"]["definitionName"]
        : runtimeService.id;

    return {
      serviceName: name,
      description,
      host: accessPoint.host,
      port: accessPoint.port,
      protocol: accessPoint.protocol,
      targetPort: runtimeService.healthcheck.targetPort,
      url:
        accessPoint.protocol === "http"
          ? `${accessPoint.protocol}://${accessPoint.host}:${String(accessPoint.port)}`
          : null,
    };
  }
}
