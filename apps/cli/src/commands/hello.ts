import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { createCliLogger } from "../lib/logger";

export interface HelloArguments {
  name: string;
}

export function createHelloMessage(name: string): string {
  return `Hello, ${name}!`;
}

function handler(arguments_: ArgumentsCamelCase<HelloArguments>): void {
  createCliLogger("hello").info(
    { name: arguments_.name },
    createHelloMessage(arguments_.name),
  );
}

export const helloCommand: CommandModule<object, HelloArguments> = {
  command: "hello [name]",
  describe: "Print a friendly greeting",
  builder: (argv: Argv<object>) =>
    argv.positional("name", {
      describe: "The name to greet",
      type: "string",
      default: "world",
    }),
  handler,
};
