import type { DestinationStream } from "pino";
import PinoPretty from "pino-pretty";
import { createLogger, type Logger } from "@boboddy/worker";

export type { Logger };

export function createTransport(): DestinationStream | undefined {
  if (!process.stdout.isTTY) {
    return undefined;
  }

  return PinoPretty({
    colorize: true,
    translateTime: "SYS:standard",
    destination: 1,
    ignore: "pid,hostname",
  });
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
