import pino, { type DestinationStream, type Logger } from "pino";
import PinoPretty from "pino-pretty";

export type { Logger };

export const noopLogger: Logger = pino({ level: "silent" });

export function createLogger(
  options: { name: string; level?: string },
  dest?: DestinationStream,
): Logger {
  return pino({ name: options.name, level: options.level ?? "info" }, dest);
}

function createTransport(): DestinationStream | undefined {
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
