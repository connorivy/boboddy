import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { RuntimeNetworkGarbageCollector } from "@boboddy/worker";
import { createCliLogger } from "../lib/logger";

type CleanupNetworksArguments = {
  verbose: boolean;
};

async function cleanupNetworksHandler(
  arguments_: ArgumentsCamelCase<CleanupNetworksArguments>,
): Promise<void> {
  const logger = createCliLogger("runtime-cleanup-networks-command");
  const collector = new RuntimeNetworkGarbageCollector();
  const result = await collector.cleanupUnusedNetworks();

  logger.info(
    {
      scannedCount: result.scannedCount,
      removedCount: result.removedCount,
      keptCount: result.keptCount,
      ...(arguments_.verbose
        ? {
            removedNetworks: result.removedNetworks,
            keptNetworks: result.keptNetworks,
          }
        : {}),
    },
    "Runtime network cleanup complete",
  );
}

const cleanupNetworksCommand: CommandModule<object, CleanupNetworksArguments> =
  {
    command: "cleanup-networks",
    describe: "Remove unused Boboddy runtime Docker networks",
    builder: (argv: Argv<object>) =>
      argv.option("verbose", {
        alias: "v",
        describe: "Include kept and removed network names in the output",
        type: "boolean",
        default: false,
      }),
    handler: cleanupNetworksHandler,
  };

export const runtimeCommand: CommandModule<object, object> = {
  command: "runtime <command>",
  describe: "Inspect or clean up local runtime artifacts",
  builder: (argv: Argv<object>) =>
    argv.command(cleanupNetworksCommand).demandCommand(1),
  handler: () => {},
};
