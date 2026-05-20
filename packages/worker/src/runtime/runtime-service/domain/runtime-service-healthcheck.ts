import { CoreValidationError } from "../../../lib/errors";

export const RUNTIME_SERVICE_HEALTHCHECK_PROTOCOL_KINDS = [
  "http",
  "tcp",
] as const;
export type RuntimeServiceHealthcheckProtocolKind =
  (typeof RUNTIME_SERVICE_HEALTHCHECK_PROTOCOL_KINDS)[number];

export type RuntimeServiceHealthcheck = {
  protocolKind: RuntimeServiceHealthcheckProtocolKind;
  targetPort: number;
  path: string | null;
  expectedStatus: number | null;
  intervalMs: number;
  timeoutMs: number;
  retries: number;
};

const normalizePositiveInteger = (
  value: number | undefined,
  defaultValue: number,
  message: string,
  code: string,
) => {
  const candidate = value ?? defaultValue;
  if (!Number.isInteger(candidate) || candidate < 1) {
    throw new CoreValidationError(message, code);
  }

  return candidate;
};

export const createRuntimeServiceHealthcheck = (input: {
  protocolKind: RuntimeServiceHealthcheckProtocolKind;
  targetPort: number;
  path?: string | null | undefined;
  expectedStatus?: number | null | undefined;
  intervalMs?: number | undefined;
  timeoutMs?: number | undefined;
  retries?: number | undefined;
}): RuntimeServiceHealthcheck => {
  if (!Number.isInteger(input.targetPort) || input.targetPort < 1 || input.targetPort > 65_535) {
    throw new CoreValidationError(
      "Runtime service healthcheck targetPort must be an integer between 1 and 65535",
      "RUNTIME_SERVICE_HEALTHCHECK_TARGET_PORT_INVALID",
    );
  }

  const intervalMs = normalizePositiveInteger(
    input.intervalMs,
    500,
    "Runtime service healthcheck intervalMs must be a positive integer",
    "RUNTIME_SERVICE_HEALTHCHECK_INTERVAL_INVALID",
  );
  const timeoutMs = normalizePositiveInteger(
    input.timeoutMs,
    1_000,
    "Runtime service healthcheck timeoutMs must be a positive integer",
    "RUNTIME_SERVICE_HEALTHCHECK_TIMEOUT_INVALID",
  );
  const retries = normalizePositiveInteger(
    input.retries,
    20,
    "Runtime service healthcheck retries must be a positive integer",
    "RUNTIME_SERVICE_HEALTHCHECK_RETRIES_INVALID",
  );

  if (input.protocolKind === "tcp") {
    if (input.path !== undefined && input.path !== null) {
      throw new CoreValidationError(
        "TCP runtime service healthchecks do not support an HTTP path",
        "RUNTIME_SERVICE_HEALTHCHECK_PATH_NOT_ALLOWED",
      );
    }

    if (input.expectedStatus !== undefined && input.expectedStatus !== null) {
      throw new CoreValidationError(
        "TCP runtime service healthchecks do not support an expectedStatus",
        "RUNTIME_SERVICE_HEALTHCHECK_EXPECTED_STATUS_NOT_ALLOWED",
      );
    }

    return {
      protocolKind: input.protocolKind,
      targetPort: input.targetPort,
      path: null,
      expectedStatus: null,
      intervalMs,
      timeoutMs,
      retries,
    };
  }

  const normalizedPath = input.path?.trim() || "/";
  const expectedStatus = input.expectedStatus ?? 200;

  if (
    !Number.isInteger(expectedStatus) ||
    expectedStatus < 100 ||
    expectedStatus > 599
  ) {
    throw new CoreValidationError(
      "HTTP runtime service healthcheck expectedStatus must be an integer between 100 and 599",
      "RUNTIME_SERVICE_HEALTHCHECK_EXPECTED_STATUS_INVALID",
    );
  }

  return {
    protocolKind: input.protocolKind,
    targetPort: input.targetPort,
    path: normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`,
    expectedStatus,
    intervalMs,
    timeoutMs,
    retries,
  };
};
