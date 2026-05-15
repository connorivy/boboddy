import type {
  ProcessProjectWorkDeps,
  ProjectWorkLogger,
} from "./process-project-work.types";

export const noopProjectWorkLogger: ProjectWorkLogger = {
  log: () => undefined,
  error: () => undefined,
};

export function resolveProjectWorkLogger(
  deps: Pick<ProcessProjectWorkDeps, "logger">,
): ProjectWorkLogger {
  return deps.logger ?? noopProjectWorkLogger;
}
