import pino, { type Logger } from "pino";

function createTransport() {
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
  });
}

export const cliLogger = pino(
  {
    name: "@boboddy/cli",
    level: process.env["BOBODDY_LOG_LEVEL"] ?? "info",
  },
  createTransport(),
);

export function createCliLogger(scope: string): Logger {
  return cliLogger.child({ scope });
}
