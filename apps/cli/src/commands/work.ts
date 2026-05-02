import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { processProjectWork } from "../work/process-project-work";
import { logWork } from "../work/work-logger";
import { resolveBoboddyBaseUrl } from "../auth/config";
import { createCliLogger } from "../lib/logger";

export interface WorkArguments {
  projectId: string;
  baseUrl: string | undefined;
  batchSize: number | undefined;
  concurrency: number | undefined;
  leaseDurationSeconds: number | undefined;
  once: boolean;
  preserveRuntimeOnComplete: boolean;
  pollIntervalMs: number | undefined;
  workerId: string | undefined;
}

async function handler(
  arguments_: ArgumentsCamelCase<WorkArguments>,
): Promise<void> {
  const logger = createCliLogger("work-command");
  const baseUrl = resolveBoboddyBaseUrl(arguments_.baseUrl);

  logWork("cli", "Starting worker command", {
    projectId: arguments_.projectId,
    baseUrl,
    batchSize: arguments_.batchSize,
    concurrency: arguments_.concurrency,
    leaseDurationSeconds: arguments_.leaseDurationSeconds,
    once: arguments_.once,
    preserveRuntimeOnComplete: arguments_.preserveRuntimeOnComplete,
    pollIntervalMs: arguments_.pollIntervalMs,
    workerId: arguments_.workerId,
  });

  const result = await processProjectWork({
    projectId: arguments_.projectId,
    baseUrl,
    batchSize: arguments_.batchSize,
    concurrency: arguments_.concurrency,
    leaseDurationSeconds: arguments_.leaseDurationSeconds,
    preserveRuntimeOnComplete: arguments_.preserveRuntimeOnComplete,
    once: arguments_.once,
    pollIntervalMs: arguments_.pollIntervalMs,
    workerId: arguments_.workerId,
  });

  if (arguments_.once) {
    logWork("cli", "Worker command completed single-pass run", {
      projectId: arguments_.projectId,
      ...result,
    });
    logger.info(
      {
        projectId: arguments_.projectId,
        ...result,
      },
      "Single-pass work result",
    );
  }
}

export const workCommand: CommandModule<object, WorkArguments> = {
  command: "work <projectId>",
  describe: "Run the Boboddy host worker for a project",
  builder: (argv: Argv<object>) =>
    argv
      .positional("projectId", {
        describe: "The project id to process work for",
        type: "string",
        demandOption: true,
      })
      .option("baseUrl", {
        alias: "base-url",
        describe: "Boboddy app base URL",
        type: "string",
      })
      .option("batchSize", {
        alias: "b",
        describe: "Maximum number of step executions to claim per poll",
        type: "number",
      })
      .option("concurrency", {
        alias: "c",
        describe: "Maximum number of concurrently active jobs",
        type: "number",
      })
      .option("leaseDurationSeconds", {
        alias: "l",
        describe: "How long the claim lease should last",
        type: "number",
      })
      .option("pollIntervalMs", {
        alias: "p",
        describe: "How often to poll for new step executions",
        type: "number",
      })
      .option("once", {
        describe: "Poll a single time and wait for any claimed jobs to finish",
        type: "boolean",
        default: false,
      })
      .option("preserveRuntimeOnComplete", {
        alias: "k",
        describe: "Keep runtime containers and workspace after step completion",
        type: "boolean",
        default: false,
      })
      .option("workerId", {
        alias: "w",
        describe: "Optional worker identifier to use while claiming steps",
        type: "string",
      }),
  handler,
};
