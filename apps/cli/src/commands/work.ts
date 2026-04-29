import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { processProjectWork } from "../work/process-project-work";

export interface WorkArguments {
  projectId: string;
  batchSize: number;
  leaseDurationSeconds: number;
  workerId: string | undefined;
}

async function handler(arguments_: ArgumentsCamelCase<WorkArguments>): Promise<void> {
  const result = await processProjectWork({
    projectId: arguments_.projectId,
    batchSize: arguments_.batchSize,
    leaseDurationSeconds: arguments_.leaseDurationSeconds,
    workerId: arguments_.workerId,
  });

  console.log(
    JSON.stringify(
      {
        projectId: arguments_.projectId,
        ...result,
      },
      null,
      2,
    ),
  );
}

export const workCommand: CommandModule<object, WorkArguments> = {
  command: "work <projectId>",
  describe: "Claim queued step executions for a project",
  builder: (argv: Argv<object>) =>
    argv
      .positional("projectId", {
        describe: "The project id to process work for",
        type: "string",
        demandOption: true,
      })
      .option("batchSize", {
        alias: "b",
        describe: "Maximum number of step executions to claim in one run",
        type: "number",
        default: 10,
      })
      .option("leaseDurationSeconds", {
        alias: "l",
        describe: "How long the claim lease should last",
        type: "number",
        default: 30,
      })
      .option("workerId", {
        alias: "w",
        describe: "Optional worker identifier to use while claiming steps",
        type: "string",
      }) as Argv<WorkArguments>,
  handler,
};
