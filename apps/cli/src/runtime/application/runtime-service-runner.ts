import type { AnyJsonObject } from "../../lib/json";
import type { ProjectRuntimeSessionExecutionTarget } from "../domain/project-runtime-session-execution-target";
import type { RuntimeServiceAccessPoint } from "../domain/runtime-service-access-point";
import type { RuntimeServiceEntity } from "../domain/runtime-service-entity";

export type RuntimeServiceOutputEvent = {
  stream: "stdout" | "stderr";
  chunk: string;
};

export type RuntimeServiceRunner = {
  start(input: {
    runtimeService: RuntimeServiceEntity;
    executionTarget: ProjectRuntimeSessionExecutionTarget;
    onOutput?: ((output: RuntimeServiceOutputEvent) => Promise<void> | void) | undefined;
  }): Promise<{
    accessPoints: RuntimeServiceAccessPoint[];
    readyAt: Date;
    metadata?: AnyJsonObject | undefined;
  }>;
  stop(input: {
    runtimeService: RuntimeServiceEntity;
    executionTarget: ProjectRuntimeSessionExecutionTarget;
  }): Promise<void>;
};
