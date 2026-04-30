export const RUNTIME_PROXY_PROTOCOLS = ["tcp", "http"] as const;

export type RuntimeProxyProtocol = (typeof RUNTIME_PROXY_PROTOCOLS)[number];

export type RuntimeProxyMapping = {
  listenPort: number;
  targetHost: string;
  targetPort: number;
  protocol: RuntimeProxyProtocol;
};

export type RuntimeProxyConfig = {
  mappings: RuntimeProxyMapping[];
};

interface JsonObject {
  [key: string]: JsonValue;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

const isRecord = (value: JsonValue | object | undefined): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isRuntimeProxyProtocol = (
  value: JsonValue | undefined,
): value is RuntimeProxyProtocol =>
  typeof value === "string" &&
  (RUNTIME_PROXY_PROTOCOLS as readonly string[]).includes(value);

const normalizePort = (
  value: JsonValue | undefined,
  fieldName: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 65_535
  ) {
    throw new Error(`${fieldName} must be an integer between 1 and 65535`);
  }

  return value;
};

const normalizeTargetHost = (value: JsonValue | undefined): string => {
  if (typeof value !== "string") {
    return "127.0.0.1";
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return "127.0.0.1";
  }

  return normalizedValue;
};

const normalizeProtocol = (
  value: JsonValue | undefined,
): RuntimeProxyProtocol => {
  if (value === undefined) {
    return "tcp";
  }

  if (!isRuntimeProxyProtocol(value)) {
    throw new Error("protocol must be one of: tcp, http");
  }

  return value;
};

export const parseRuntimeProxyConfig = (
  value: object | null,
): RuntimeProxyConfig => {
  if (!isRecord(value)) {
    throw new Error("Runtime proxy config must be an object");
  }

  const mappingsValue = value["mappings"];
  if (!Array.isArray(mappingsValue)) {
    throw new Error("Runtime proxy config must include a mappings array");
  }

  const mappings = mappingsValue.map((mapping, index) => {
    if (!isRecord(mapping)) {
      throw new Error(`Mapping at index ${String(index)} must be an object`);
    }

    return {
      listenPort: normalizePort(
        mapping["listenPort"],
        `mappings[${String(index)}].listenPort`,
      ),
      targetHost: normalizeTargetHost(mapping["targetHost"]),
      targetPort: normalizePort(
        mapping["targetPort"],
        `mappings[${String(index)}].targetPort`,
      ),
      protocol: normalizeProtocol(mapping["protocol"]),
    };
  });

  const seenListenPorts = new Set<number>();
  for (const mapping of mappings) {
    if (seenListenPorts.has(mapping.listenPort)) {
      throw new Error(
        `Duplicate listenPort detected: ${String(mapping.listenPort)}`,
      );
    }

    seenListenPorts.add(mapping.listenPort);
  }

  return {
    mappings,
  };
};
