import type { AnyJsonObject } from "../../lib/json";
import type { ProjectRuntimeSessionExecutionTarget } from "../domain/project-runtime-session-execution-target";

export type RuntimeCommandExecutionOutputTransport = {
  stdout: string;
  stderr: string;
  logRef?: string | null | undefined;
};

export type RuntimeCommandExecutionOutcome = {
  exitCode: number | null;
  signal: string | null;
  output: RuntimeCommandExecutionOutputTransport;
  metadata?: AnyJsonObject | undefined;
};

export type RuntimeCommandRunner = {
  executeOneShot(input: {
    command: string;
    executionTarget: ProjectRuntimeSessionExecutionTarget;
    metadata?: AnyJsonObject | undefined;
    onOutput?:
      | ((output: { stream: "stdout" | "stderr"; chunk: string }) => Promise<void> | void)
      | undefined;
    signal?: AbortSignal | undefined;
  }): Promise<RuntimeCommandExecutionOutcome>;
};
