import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { runProxy } from "@boboddy/runtime-proxy";

export interface ProxyArguments {
  config: string;
}

async function handler(
  arguments_: ArgumentsCamelCase<ProxyArguments>,
): Promise<void> {
  await runProxy(arguments_.config);
}

export const proxyCommand: CommandModule<object, ProxyArguments> = {
  command: "proxy",
  describe: false,
  builder: (argv: Argv<object>) =>
    argv.option("config", {
      describe: "Path to the proxy config JSON",
      type: "string",
      demandOption: true,
    }),
  handler,
};
