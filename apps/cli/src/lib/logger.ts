import pino, { type DestinationStream } from "pino";
import { createLogger, type Logger } from "@boboddy/core/lib/logger";

function createTransport(): DestinationStream | undefined {
  if (!process.stdout.isTTY) {
    return undefined;
  }

  return pino.transport({
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      destination: 1,
      ignore: "pid,hostname",
    },
  }) as DestinationStream;
}

export const cliLogger: Logger = createLogger(
  {
    name: "@boboddy/cli",
    level: process.env["BOBODDY_LOG_LEVEL"] ?? "info",
  },
  createTransport(),
);

export function createCliLogger(scope: string): Logger {
  return cliLogger.child({ scope });
}
