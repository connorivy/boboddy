import type { ProjectRuntimeSessionExecutionTarget } from "../domain/project-runtime-session-execution-target";
import type {
  RuntimeServiceAccessPoint,
  RuntimeServiceAccessPointProtocol,
} from "../domain/runtime-service-access-point";

export type RuntimeSessionServiceAccessPoint = RuntimeServiceAccessPoint & {
  targetPort: number;
};

export type EnsureDefaultRuntimeServiceAccessPointsInput = {
  executionTarget: ProjectRuntimeSessionExecutionTarget;
  workspacePath: string;
  devcontainerConfigPath: string;
};

export type EnsureRuntimeServiceAccessPointInput =
  EnsureDefaultRuntimeServiceAccessPointsInput & {
    targetPort: number;
    protocol: RuntimeServiceAccessPointProtocol;
  };

export type RuntimeSessionServiceExposureProvider = {
  ensureDefaultAccessPoints(
    input: EnsureDefaultRuntimeServiceAccessPointsInput,
  ): Promise<RuntimeSessionServiceAccessPoint[]>;
  ensureAccessPoint(
    input: EnsureRuntimeServiceAccessPointInput,
  ): Promise<RuntimeSessionServiceAccessPoint>;
  stop(executionTarget: ProjectRuntimeSessionExecutionTarget): Promise<void>;
};
