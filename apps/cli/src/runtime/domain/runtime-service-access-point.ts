import {
  CoreValidationError,
  InvariantViolationError,
} from "../../lib/errors";

export const RUNTIME_SERVICE_ACCESS_POINT_PROTOCOLS = ["tcp", "http"] as const;

export type RuntimeServiceAccessPointProtocol =
  (typeof RUNTIME_SERVICE_ACCESS_POINT_PROTOCOLS)[number];

export type RuntimeServiceAccessPoint = {
  host: string;
  port: number;
  protocol: RuntimeServiceAccessPointProtocol;
};

const isRuntimeServiceAccessPointProtocol = (
  value: string,
): value is RuntimeServiceAccessPointProtocol =>
  (RUNTIME_SERVICE_ACCESS_POINT_PROTOCOLS as readonly string[]).includes(value);

export const createRuntimeServiceAccessPoint = (input: {
  host: string;
  port: number;
  protocol: string;
}): RuntimeServiceAccessPoint => {
  const host = input.host.trim();
  if (!host) {
    throw new CoreValidationError(
      "Runtime service access point host is required",
      "RUNTIME_SERVICE_ACCESS_POINT_HOST_REQUIRED",
    );
  }

  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65_535) {
    throw new CoreValidationError(
      "Runtime service access point port must be an integer between 1 and 65535",
      "RUNTIME_SERVICE_ACCESS_POINT_PORT_INVALID",
    );
  }

  if (!isRuntimeServiceAccessPointProtocol(input.protocol)) {
    throw new InvariantViolationError(
      `Unsupported runtime service access point protocol: ${input.protocol}`,
      "RUNTIME_SERVICE_ACCESS_POINT_PROTOCOL_INVALID",
    );
  }

  return {
    host,
    port: input.port,
    protocol: input.protocol,
  };
};
