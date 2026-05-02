import { createCliLogger } from "../lib/logger";

type WorkLogDetails = Record<string, unknown>;

const workLogger = createCliLogger("work");

export function logWork(
  scope: string,
  message: string,
  details?: WorkLogDetails,
): void {
  workLogger.info({ ...details, workScope: scope }, message);
}

export function logWorkError(
  scope: string,
  message: string,
  details?: WorkLogDetails,
): void {
  workLogger.error({ ...details, workScope: scope }, message);
}
