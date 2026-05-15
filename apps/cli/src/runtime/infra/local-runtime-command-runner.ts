import { spawn } from "node:child_process";
import type {
  AnyJsonObject,
  AnyJsonValue,
} from "../../lib/json";
import { ConfigurationError } from "../../lib/errors";
import { noopLogger, type Logger } from "../../lib/logger";
import type { ProjectRuntimeSessionExecutionTarget } from "../domain/project-runtime-session-execution-target";
import { resolveDevcontainerWorkingDirectory } from "./local-devcontainer-working-directory";
import { getProjectOpencodeRuntimeMetadata } from "../../work/opencode-runtime/application/project-opencode-runtime-metadata";
import { summarizeRuntimeCommandOutput } from "../application/runtime-command-output-summary";
import type {
  RuntimeCommandExecutionOutcome,
  RuntimeCommandRunner,
} from "../application/runtime-command-runner";

type SpawnInput = {
  command: string;
  args: string[];
  cwd?: string | undefined;
};

const readLocalExecutionMetadata = (metadata: AnyJsonObject) => {
  const localExecution = metadata["localExecution"];
  if (!isJsonObject(localExecution)) {
    return {
      containerId: null,
      workspacePath: null,
      devcontainerConfigPath: null,
    };
  }

  return {
    containerId: readOptionalString(localExecution, "containerId"),
    workspacePath: readOptionalString(localExecution, "workspacePath"),
    devcontainerConfigPath: readOptionalString(
      localExecution,
      "devcontainerConfigPath",
    ),
  };
};

const isJsonObject = (
  value: AnyJsonValue | undefined,
): value is AnyJsonObject =>
  value !== null &&
  value !== undefined &&
  !Array.isArray(value) &&
  typeof value === "object";

const readOptionalString = (
  object: AnyJsonObject,
  key: string,
): string | null => {
  const value = object[key];
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const runProcess = async ({
  command,
  args,
  cwd,
  onOutput,
  signal,
}: SpawnInput & {
  onOutput?:
    | ((output: {
        stream: "stdout" | "stderr";
        chunk: string;
      }) => Promise<void> | void)
    | undefined;
  signal?: AbortSignal | undefined;
}): Promise<RuntimeCommandExecutionOutcome> =>
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    const onAbort = () => {
      child.kill("SIGTERM");
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      const content = String(chunk);
      stdout += content;
      if (content) {
        void onOutput?.({ stream: "stdout", chunk: content });
      }
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      const content = String(chunk);
      stderr += content;
      if (content) {
        void onOutput?.({ stream: "stderr", chunk: content });
      }
    });
    child.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (exitCode, closeSignal) => {
      signal?.removeEventListener("abort", onAbort);
      resolve({
        exitCode,
        signal: closeSignal,
        output: {
          stdout,
          stderr,
        },
      });
    });
  });

const isRuntimeCommandExecutionFailure = (
  result: RuntimeCommandExecutionOutcome,
) => result.exitCode !== 0 || result.signal !== null;

export class LocalRuntimeCommandRunner implements RuntimeCommandRunner {
  constructor(private readonly logger: Logger = noopLogger) {}

  async executeOneShot({
    command,
    executionTarget,
    metadata,
    onOutput,
    signal,
  }: {
    command: string;
    executionTarget: ProjectRuntimeSessionExecutionTarget;
    metadata?: AnyJsonObject | undefined;
    onOutput?:
      | ((output: {
          stream: "stdout" | "stderr";
          chunk: string;
        }) => Promise<void> | void)
      | undefined;
    signal?: AbortSignal | undefined;
  }) {
    const log = this.logger.child({ scope: "LocalRuntimeCommandRunner" });
    const { containerId, workspacePath, devcontainerConfigPath } =
      readLocalExecutionMetadata(executionTarget.metadata);
    const projectOpencodeMetadata = metadata
      ? getProjectOpencodeRuntimeMetadata(metadata)
      : null;
    const resolvedCwd = projectOpencodeMetadata?.cwd ?? null;
    const containerWorkingDirectory =
      containerId && workspacePath && devcontainerConfigPath
        ? await resolveDevcontainerWorkingDirectory({
            workspacePath,
            devcontainerConfigPath,
            cwd: resolvedCwd,
          })
        : null;
    const wrappedCommand =
      resolvedCwd && !containerWorkingDirectory
        ? `cd ${JSON.stringify(resolvedCwd)} && ${command}`
        : command;

    if (containerId) {
      log.info(
        {
          mode: "devcontainer",
          containerId,
          cwd: resolvedCwd,
          containerWorkingDirectory,
          command,
          wrappedCommand,
        },
        "runtime command exec start",
      );
      const result = await runProcess({
        command: "docker",
        args: [
          "exec",
          ...(containerWorkingDirectory
            ? ["-w", containerWorkingDirectory]
            : []),
          containerId,
          "sh",
          "-lc",
          wrappedCommand,
        ],
        onOutput: async (output) => {
          if (log.isLevelEnabled("debug")) {
            log.debug(
              { stream: output.stream },
              "runtime command output chunk",
            );
          }
          await onOutput?.(output);
        },
        signal,
      });
      const output = summarizeRuntimeCommandOutput(result.output);
      const message = isRuntimeCommandExecutionFailure(result)
        ? "runtime command exec failed"
        : "runtime command exec end";
      log[isRuntimeCommandExecutionFailure(result) ? "warn" : "info"](
        {
          mode: "devcontainer",
          containerId,
          cwd: resolvedCwd,
          containerWorkingDirectory,
          command,
          wrappedCommand,
          exitCode: result.exitCode,
          signal: result.signal,
          output,
        },
        message,
      );

      return {
        ...result,
        metadata: {
          mode: "devcontainer",
        },
      };
    }

    if (!workspacePath) {
      throw new ConfigurationError(
        "Local runtime command execution requires local execution metadata with a workspace path or container id",
        "RUNTIME_COMMAND_WORKSPACE_UNAVAILABLE",
      );
    }

    log.info(
      {
        mode: "workspace",
        workspacePath,
        cwd: resolvedCwd,
        command,
        wrappedCommand,
      },
      "runtime command exec start",
    );
    const result = await runProcess({
      command: "sh",
      args: ["-lc", wrappedCommand],
      cwd: workspacePath,
      onOutput: async (output) => {
        if (log.isLevelEnabled("debug")) {
          log.debug({ stream: output.stream }, "runtime command output chunk");
        }
        await onOutput?.(output);
      },
      signal,
    });
    const output = summarizeRuntimeCommandOutput(result.output);
    const message = isRuntimeCommandExecutionFailure(result)
      ? "runtime command exec failed"
      : "runtime command exec end";
    log[isRuntimeCommandExecutionFailure(result) ? "warn" : "info"](
      {
        mode: "workspace",
        workspacePath,
        cwd: resolvedCwd,
        command,
        wrappedCommand,
        exitCode: result.exitCode,
        signal: result.signal,
        output,
      },
      message,
    );

    return {
      ...result,
      metadata: {
        mode: "workspace",
      },
    };
  }
}
