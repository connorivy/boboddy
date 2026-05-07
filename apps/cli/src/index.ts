import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { authCommand } from "./commands/auth";
import { helloCommand } from "./commands/hello";
import { runtimeCommand } from "./commands/runtime";
import { workCommand } from "./commands/work";
import { createCliLogger } from "./lib/logger";

const CLI_VERSION = "0.0.0";
const logger = createCliLogger("cli");

export function createCli(argv: readonly string[]) {
  return yargs(argv)
    .scriptName("boboddy")
    .strict()
    .help()
    .version(CLI_VERSION)
    .fail((message, error) => {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(message);
    })
    .showHelpOnFail(false)
    .exitProcess(false)
    .command(authCommand)
    .command(helloCommand)
    .command(runtimeCommand)
    .command(workCommand)
    .demandCommand(1, "A command is required.");
}

export async function run(argv: readonly string[] = hideBin(process.argv)): Promise<number> {
  try {
    await createCli(argv).parseAsync();
    return 0;
  } catch (error) {
    if (error instanceof Error) {
      logger.error({ err: error }, error.message);
    } else {
      logger.error({ error }, "Unknown CLI error.");
    }

    return 1;
  }
}

const exitCode = await run();
process.exit(exitCode);
