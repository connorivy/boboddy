import pino, { type DestinationStream, type Logger } from "pino";

export type { Logger };

export const noopLogger: Logger = pino({ level: "silent" });

export function createLogger(
  options: { name: string; level?: string },
  dest?: DestinationStream,
): Logger {
  return pino({ name: options.name, level: options.level ?? "info" }, dest);
}
