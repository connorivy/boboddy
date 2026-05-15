import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AnyJsonObject } from "../../lib/json";
import { ConfigurationError } from "../../lib/errors";
import { noopLogger, type Logger } from "../../lib/logger";
import type { RuntimeSessionServiceExposureProvider } from "../application/runtime-session-service-exposure-provider";
import type { RuntimeServiceRunner } from "../application/runtime-service-runner";
import type { RuntimeServiceAccessPoint } from "../domain/runtime-service-access-point";
import type { RuntimeServiceEntity } from "../domain/runtime-service-entity";
import type { ProjectRuntimeSessionExecutionTarget } from "../domain/project-runtime-session-execution-target";
import { resolveDevcontainerWorkingDirectory } from "./local-devcontainer-working-directory";
import { getProjectOpencodeRuntimeMetadata } from "../../work/opencode-runtime/application/project-opencode-runtime-metadata";
import { readLocalExecutionMetadata } from "./local-devcontainer-port-forward-manager-support";
import { waitForReady } from "./local-runtime-service-readiness-probe";

const execFileAsync = promisify(execFile);
const RUNTIME_SERVICES_DIRECTORY = "/tmp/boboddy-runtime-services";

const RUNTIME_SERVICE_OUTPUT_PREVIEW_LIMIT = 4_000;

const buildOutputPreview = (value: string) =>
  value.length <= RUNTIME_SERVICE_OUTPUT_PREVIEW_LIMIT
    ? value
    : value.slice(-RUNTIME_SERVICE_OUTPUT_PREVIEW_LIMIT);

const summarizeRuntimeServiceOutput = (output: {
  stdout: string;
  stderr: string;
}) => ({
  stdoutPreview: buildOutputPreview(output.stdout),
  stderrPreview: buildOutputPreview(output.stderr),
  stdoutBytes: Buffer.byteLength(output.stdout, "utf8"),
  stderrBytes: Buffer.byteLength(output.stderr, "utf8"),
});

type RunningRuntimeServiceHandle = {
  containerId: string;
  serviceDirectory: string;
  stdoutPath: string;
  stderrPath: string;
  pidPath: string;
  stdoutTail: ChildProcessWithoutNullStreams;
  stderrTail: ChildProcessWithoutNullStreams;
};

const shellQuote = (value: string) => `'${value.replaceAll("'", `"'"'`)}'`;

const createOutputForwarder = (
  tailProcess: ChildProcessWithoutNullStreams,
  stream: "stdout" | "stderr",
  onOutput:
    | ((output: { stream: "stdout" | "stderr"; chunk: string }) => Promise<void> | void)
    | undefined,
) => {
  if (!onOutput) {
    return;
  }

  const handler = (chunk: Buffer | string) => {
    const content = String(chunk);
    if (!content) {
      return;
    }

    void onOutput({ stream, chunk: content });
  };

  tailProcess.stdout.on("data", handler);
};

export class LocalRuntimeServiceRunner implements RuntimeServiceRunner {
  private readonly runningServices = new Map<string, RunningRuntimeServiceHandle>();

  constructor(
    private readonly runtimeSessionServiceExposureProvider: RuntimeSessionServiceExposureProvider,
    private readonly logger: Logger = noopLogger,
  ) {}

  async start({
    runtimeService,
    executionTarget,
    onOutput,
  }: {
    runtimeService: RuntimeServiceEntity;
    executionTarget: ProjectRuntimeSessionExecutionTarget;
    onOutput?: ((output: { stream: "stdout" | "stderr"; chunk: string }) => Promise<void> | void) | undefined;
  }): Promise<{
    accessPoints: RuntimeServiceAccessPoint[];
    readyAt: Date;
    metadata?: AnyJsonObject | undefined;
  }> {
    const log = this.logger.child({ scope: "LocalRuntimeServiceRunner", runtimeServiceId: runtimeService.id });
    const localExecution = readLocalExecutionMetadata(executionTarget);
    const workspacePath = localExecution.workspacePath;
    const devcontainerConfigPath = localExecution.devcontainerConfigPath;

    if (!workspacePath || !devcontainerConfigPath) {
      throw new ConfigurationError(
        "Runtime service execution requires workspacePath and devcontainerConfigPath metadata",
        "RUNTIME_SERVICE_EXECUTION_METADATA_MISSING",
      );
    }

    log.info({ containerId: localExecution.containerId, workspacePath, command: runtimeService.command }, "runtime service start");
    await this.stop({ runtimeService, executionTarget });
    const projectOpencodeMetadata = getProjectOpencodeRuntimeMetadata(
      runtimeService.metadata,
    );
    const containerWorkingDirectory = await resolveDevcontainerWorkingDirectory({
      workspacePath,
      devcontainerConfigPath,
      cwd: projectOpencodeMetadata?.cwd ?? null,
    });

    const serviceDirectory = `${RUNTIME_SERVICES_DIRECTORY}/${runtimeService.id}`;
    const stdoutPath = `${serviceDirectory}/stdout.log`;
    const stderrPath = `${serviceDirectory}/stderr.log`;
    const pidPath = `${serviceDirectory}/service.pid`;
    const commandScriptPath = `${serviceDirectory}/command.sh`;

    await execFileAsync("docker", [
      "exec",
      localExecution.containerId,
      "sh",
      "-lc",
      `mkdir -p ${shellQuote(serviceDirectory)} && : > ${shellQuote(stdoutPath)} && : > ${shellQuote(stderrPath)}`,
    ]);
    await this.copyCommandScript({
      command: runtimeService.command,
      containerId: localExecution.containerId,
      commandScriptPath,
      cwd: containerWorkingDirectory ? null : projectOpencodeMetadata?.cwd ?? null,
    });
    await execFileAsync("docker", [
      "exec",
      localExecution.containerId,
      "sh",
      "-lc",
      `chmod +x ${shellQuote(commandScriptPath)}`,
    ]);
    await execFileAsync("docker", [
      "exec",
      "-d",
      ...(containerWorkingDirectory ? ["-w", containerWorkingDirectory] : []),
      localExecution.containerId,
      "sh",
      "-lc",
      `${shellQuote(commandScriptPath)} > ${shellQuote(stdoutPath)} 2> ${shellQuote(stderrPath)} < /dev/null & service_pid=$!; echo "$service_pid" > ${shellQuote(pidPath)}; wait "$service_pid"`,
    ]);
    log.info(
      {
        containerId: localExecution.containerId,
        containerWorkingDirectory,
        serviceDirectory,
        stdoutPath,
        stderrPath,
        pidPath,
      },
      "runtime service process launched",
    );

    const stdoutTail = spawn("docker", [
      "exec",
      localExecution.containerId,
      "sh",
      "-lc",
      `tail -n +1 -F ${shellQuote(stdoutPath)}`,
    ]);
    const stderrTail = spawn("docker", [
      "exec",
      localExecution.containerId,
      "sh",
      "-lc",
      `tail -n +1 -F ${shellQuote(stderrPath)}`,
    ]);
    const loggedOnOutput = onOutput
      ? (output: { stream: "stdout" | "stderr"; chunk: string }) => {
          if (log.isLevelEnabled("debug")) {
            log.debug({ stream: output.stream }, "runtime service output chunk");
          }
          return onOutput(output);
        }
      : undefined;
    createOutputForwarder(stdoutTail, "stdout", loggedOnOutput);
    createOutputForwarder(stderrTail, "stderr", loggedOnOutput);

    this.runningServices.set(runtimeService.id, {
      containerId: localExecution.containerId,
      serviceDirectory,
      stdoutPath,
      stderrPath,
      pidPath,
      stdoutTail,
      stderrTail,
    });

    const accessPoint = await this.runtimeSessionServiceExposureProvider.ensureAccessPoint({
      executionTarget,
      workspacePath,
      devcontainerConfigPath,
      targetPort: runtimeService.healthcheck.targetPort,
      protocol:
        runtimeService.healthcheck.protocolKind === "http" ? "http" : "tcp",
    });

    try {
      await waitForReady({
        healthcheck: runtimeService.healthcheck,
        accessPoint: {
          ...accessPoint,
          port: runtimeService.healthcheck.targetPort,
        },
        checkContainerId: localExecution.containerId,
        checkHost: "127.0.0.1",
        log,
      });
    } catch (error) {
      const serviceOutput = await this.readServiceOutputSummary({
        containerId: localExecution.containerId,
        stdoutPath,
        stderrPath,
      }).catch(() => null);
      log.error(
        {
          err: error,
          command: runtimeService.command,
          healthcheck: runtimeService.healthcheck,
          serviceLogPaths: {
            stdoutPath,
            stderrPath,
            pidPath,
          },
          serviceOutput,
        },
        "runtime service start failed",
      );
      await this.stop({ runtimeService, executionTarget }).catch(() => undefined);
      throw error;
    }

    const readyAt = new Date();
    log.info({ readyAt: readyAt.toISOString(), accessPoints: [accessPoint] }, "runtime service ready");
    return {
      accessPoints: [accessPoint],
      readyAt,
      metadata: {
        mode: "devcontainer",
      },
    };
  }

  async stop({
    runtimeService,
    executionTarget,
  }: {
    runtimeService: RuntimeServiceEntity;
    executionTarget: ProjectRuntimeSessionExecutionTarget;
  }): Promise<void> {
    const log = this.logger.child({ scope: "LocalRuntimeServiceRunner", runtimeServiceId: runtimeService.id });
    const localExecution = readLocalExecutionMetadata(executionTarget);
    const handle = this.runningServices.get(runtimeService.id);
    log.info({ containerId: localExecution.containerId }, "runtime service stop");
    const serviceDirectory = handle?.serviceDirectory ?? `${RUNTIME_SERVICES_DIRECTORY}/${runtimeService.id}`;
    const pidPath = handle?.pidPath ?? `${serviceDirectory}/service.pid`;

    await execFileAsync("docker", [
      "exec",
      localExecution.containerId,
      "sh",
      "-lc",
      `if [ -f ${shellQuote(pidPath)} ]; then pid=$(cat ${shellQuote(pidPath)}); pkill -TERM -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; sleep 1; pkill -KILL -P "$pid" 2>/dev/null || true; kill -9 "$pid" 2>/dev/null || true; fi; rm -rf ${shellQuote(serviceDirectory)}`,
    ]).catch(() => undefined);

    if (handle) {
      handle.stdoutTail.kill("SIGTERM");
      handle.stderrTail.kill("SIGTERM");
      this.runningServices.delete(runtimeService.id);
    }
  }

  private async copyCommandScript(input: {
    command: string;
    containerId: string;
    commandScriptPath: string;
    cwd: string | null;
  }): Promise<void> {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "boboddy-runtime-service-command-"),
    );

    try {
      const localScriptPath = path.join(tempDirectory, "command.sh");
      const cwdLine = input.cwd ? `cd ${shellQuote(input.cwd)}\n` : "";
      await writeFile(
        localScriptPath,
        `#!/bin/sh\nset -eu\n${cwdLine}${input.command}\n`,
        "utf8",
      );
      await execFileAsync("docker", [
        "cp",
        localScriptPath,
        `${input.containerId}:${input.commandScriptPath}`,
      ]);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  private async readServiceOutputSummary(input: {
    containerId: string;
    stdoutPath: string;
    stderrPath: string;
  }) {
    const [stdout, stderr] = await Promise.all([
      this.readServiceStreamOutput(input.containerId, input.stdoutPath),
      this.readServiceStreamOutput(input.containerId, input.stderrPath),
    ]);

    return summarizeRuntimeServiceOutput({
      stdout,
      stderr,
    });
  }

  private async readServiceStreamOutput(containerId: string, streamPath: string) {
    const result = await execFileAsync("docker", [
      "exec",
      containerId,
      "sh",
      "-lc",
      `if [ -f ${shellQuote(streamPath)} ]; then cat ${shellQuote(streamPath)}; fi`,
    ]);
    return result.stdout;
  }
}
