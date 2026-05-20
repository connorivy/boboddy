import { CoreValidationError } from "../../../lib/errors";

export const RUNTIME_ENVIRONMENT_ROLES = ["project", "agent"] as const;

export type RuntimeEnvironmentRole =
  (typeof RUNTIME_ENVIRONMENT_ROLES)[number];

export type RuntimeEnvironmentRef = string & {
  readonly __brand: "RuntimeEnvironmentRef";
};

export type RuntimeRunnerAssignment = string & {
  readonly __brand: "RuntimeRunnerAssignment";
};

const normalizeOpaqueRuntimeValue = (
  value: string,
  fieldName: string,
  errorCode: string,
) => {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new CoreValidationError(
      `Runtime environment ${fieldName} is required`,
      errorCode,
    );
  }

  if (
    normalizedValue.startsWith(":") ||
    normalizedValue.endsWith(":") ||
    !normalizedValue.includes(":") ||
    /\s/.test(normalizedValue)
  ) {
    throw new CoreValidationError(
      `Runtime environment ${fieldName} must be an opaque colon-delimited identifier`,
      errorCode,
    );
  }

  return normalizedValue;
};

export const parseRuntimeEnvironmentRef = (
  value: string,
): RuntimeEnvironmentRef =>
  normalizeOpaqueRuntimeValue(
    value,
    "environmentRef",
    "RUNTIME_ENVIRONMENT_REF_INVALID",
  ) as RuntimeEnvironmentRef;

export const parseOptionalRuntimeEnvironmentRef = (
  value?: string | null,
): RuntimeEnvironmentRef | null => {
  if (value === undefined || value === null) {
    return null;
  }

  return parseRuntimeEnvironmentRef(value);
};

export const parseRuntimeRunnerAssignment = (
  value: string,
): RuntimeRunnerAssignment =>
  normalizeOpaqueRuntimeValue(
    value,
    "runnerAssignment",
    "RUNTIME_RUNNER_ASSIGNMENT_INVALID",
  ) as RuntimeRunnerAssignment;

export const parseOptionalRuntimeRunnerAssignment = (
  value?: string | null,
): RuntimeRunnerAssignment | null => {
  if (value === undefined || value === null) {
    return null;
  }

  return parseRuntimeRunnerAssignment(value);
};
