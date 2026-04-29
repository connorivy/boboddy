import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { helloCommand } from "./commands/hello";

const CLI_VERSION = "0.0.0";

export function createCli(argv: readonly string[]) {
  return yargs(argv)
    .scriptName("boboddy")
    .strict()
    .help()
    .version(CLI_VERSION)
    .command(helloCommand)
    .demandCommand(1, "A command is required.");
}

export function run(argv: readonly string[] = hideBin(process.argv)): number {
  try {
    createCli(argv).parse();
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

const exitCode = run();
process.exit(exitCode);
