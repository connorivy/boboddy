import { readFile } from "node:fs/promises";
import { parseRuntimeProxyConfig } from "./config";
import { startRuntimeProxyServer } from "./proxy-server";

const CONFIG_FLAG = "--config";

const readConfigPath = (argv: readonly string[]): string => {
  const configFlagIndex = argv.findIndex((argument) => argument === CONFIG_FLAG);
  if (configFlagIndex === -1) {
    throw new Error(`Missing required ${CONFIG_FLAG} argument`);
  }

  const configPath = argv[configFlagIndex + 1];
  if (!configPath) {
    throw new Error(`Missing value for ${CONFIG_FLAG}`);
  }

  return configPath;
};

const main = async (): Promise<void> => {
  const configPath = readConfigPath(process.argv.slice(2));
  const configJson = await readFile(configPath, "utf8");
  const config = parseRuntimeProxyConfig(JSON.parse(configJson) as object | null);
  const runtimeProxyServer = await startRuntimeProxyServer(config);

  const shutdown = async () => {
    await runtimeProxyServer.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
};

await main();
