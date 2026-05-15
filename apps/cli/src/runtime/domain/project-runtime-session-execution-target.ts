import type { AnyJsonObject } from "../../lib/json";
import {
  RUNTIME_ENVIRONMENT_ROLES,
  parseRuntimeEnvironmentRef,
  parseRuntimeRunnerAssignment,
  type RuntimeEnvironmentRef,
  type RuntimeEnvironmentRole,
  type RuntimeRunnerAssignment,
} from "./runtime-environment";

export const PROJECT_RUNTIME_SESSION_EXECUTION_ENVIRONMENTS =
  RUNTIME_ENVIRONMENT_ROLES;

export type ProjectRuntimeSessionExecutionEnvironment =
  RuntimeEnvironmentRole;

export type ProjectRuntimeSessionExecutionTarget = {
  environmentRole: ProjectRuntimeSessionExecutionEnvironment;
  runnerAssignment: RuntimeRunnerAssignment;
  environmentRef: RuntimeEnvironmentRef;
  metadata: AnyJsonObject;
};

export const createProjectRuntimeSessionExecutionTarget = (input: {
  environmentRole: ProjectRuntimeSessionExecutionEnvironment;
  runnerAssignment: RuntimeRunnerAssignment | string;
  environmentRef: RuntimeEnvironmentRef | string;
  metadata?: AnyJsonObject | null | undefined;
}): ProjectRuntimeSessionExecutionTarget => ({
  environmentRole: input.environmentRole,
  runnerAssignment: parseRuntimeRunnerAssignment(input.runnerAssignment),
  environmentRef: parseRuntimeEnvironmentRef(input.environmentRef),
  metadata: input.metadata ?? {},
});
