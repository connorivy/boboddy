import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { authCommand } from "./commands/auth";
import { helloCommand } from "./commands/hello";

const CLI_VERSION = "0.0.0";

export function createCli(argv: readonly string[]) {
  return yargs(argv)
    .scriptName("boboddy")
    .strict()
    .help()
    .version(CLI_VERSION)
    .showHelpOnFail(false)
    .exitProcess(false)
    .command(authCommand)
    .command(helloCommand)
    .demandCommand(1, "A command is required.");
}

export async function run(argv: readonly string[] = hideBin(process.argv)): Promise<number> {
  try {
    await createCli(argv).parseAsync();
    return 0;
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Unknown CLI error.");
    }

    return 1;
  }
}

const exitCode = await run();
process.exit(exitCode);
