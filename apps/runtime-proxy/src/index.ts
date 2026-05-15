import { readFile } from "node:fs/promises";
import { parseRuntimeProxyConfig } from "./config";
import { startRuntimeProxyServer } from "./proxy-server";

export type {
  RuntimeProxyConfig,
  RuntimeProxyMapping,
  RuntimeProxyProtocol,
} from "./config";

export async function runProxy(configPath: string): Promise<void> {
  const configJson = await readFile(configPath, "utf8");
  const config = parseRuntimeProxyConfig(JSON.parse(configJson) as object | null);
  const server = await startRuntimeProxyServer(config);

  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      await server.stop();
      resolve();
    };
    process.on("SIGINT", () => {
      void shutdown();
    });
    process.on("SIGTERM", () => {
      void shutdown();
    });
  });
}
