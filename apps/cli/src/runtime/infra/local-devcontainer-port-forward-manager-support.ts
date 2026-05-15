import type {
  AnyJsonObject,
  AnyJsonValue,
} from "../../lib/json";
import { ConfigurationError } from "../../lib/errors";
import type { ProjectRuntimeSessionExecutionTarget } from "../domain/project-runtime-session-execution-target";

export const PROXY_DIRECTORY_PATH = "/tmp/boboddy-runtime-proxy";
export const PROXY_BINARY_PATH = `${PROXY_DIRECTORY_PATH}/boboddy-runtime-proxy`;
export const PROXY_CONFIG_PATH = `${PROXY_DIRECTORY_PATH}/config.json`;
export const PROXY_LOG_PATH = `${PROXY_DIRECTORY_PATH}/proxy.log`;
export const PROXY_PID_PATH = `${PROXY_DIRECTORY_PATH}/proxy.pid`;
export const PROXY_BOOT_WAIT_MS = 500;

export const AGENT_PROXY_DIRECTORY_PATH = "/tmp/boboddy-agent-proxy";
export const AGENT_PROXY_BINARY_PATH = `${AGENT_PROXY_DIRECTORY_PATH}/boboddy-agent-proxy`;
export const AGENT_PROXY_CONFIG_PATH = `${AGENT_PROXY_DIRECTORY_PATH}/config.json`;
export const AGENT_PROXY_LOG_PATH = `${AGENT_PROXY_DIRECTORY_PATH}/proxy.log`;
export const AGENT_PROXY_PID_PATH = `${AGENT_PROXY_DIRECTORY_PATH}/proxy.pid`;
export const PROXY_PORT_SEARCH_START = 39_000;
export const PROXY_PORT_SEARCH_END = 65_535;

export type RuntimeProxyBinaryArchitecture = "x64" | "arm64";

export type RuntimeProxyMapping = {
  listenPort: number;
  targetHost: string;
  targetPort: number;
  protocol: "tcp";
};

export type RuntimeProxyConfig = {
  mappings: readonly RuntimeProxyMapping[];
};

const parseJsonObject = (content: string): object | null => {
  const parsed = JSON.parse(content) as object | null;
  return typeof parsed === "object" && parsed !== null ? parsed : null;
};

const isRuntimeProxyMapping = (
  value: object | null | undefined,
): value is RuntimeProxyMapping =>
  typeof value === "object" &&
  value !== null &&
  "listenPort" in value &&
  typeof value.listenPort === "number" &&
  "targetHost" in value &&
  typeof value.targetHost === "string" &&
  "targetPort" in value &&
  typeof value.targetPort === "number" &&
  "protocol" in value &&
  value.protocol === "tcp";

export const readRuntimeProxyMappings = (
  value: object | null | undefined,
): RuntimeProxyMapping[] => {
  if (typeof value !== "object" || value === null || !("mappings" in value)) {
    return [];
  }

  const { mappings } = value as { mappings?: unknown };
  if (!Array.isArray(mappings)) {
    return [];
  }

  const mappingEntries = mappings as unknown[];
  const runtimeProxyMappings: RuntimeProxyMapping[] = [];
  for (const mapping of mappingEntries) {
    if (
      typeof mapping === "object" &&
      mapping !== null &&
      isRuntimeProxyMapping(mapping)
    ) {
      runtimeProxyMappings.push(mapping);
    }
  }

  return runtimeProxyMappings;
};

export const parseRuntimeProxyMappingsContent = (
  content: string,
): RuntimeProxyMapping[] => readRuntimeProxyMappings(parseJsonObject(content));


const isJsonObject = (
  value: AnyJsonValue | object | undefined,
): value is AnyJsonObject =>
  value !== null && value !== undefined && !Array.isArray(value);

const readOptionalString = (
  object: AnyJsonObject,
  key: string,
): string | null => {
  const value = object[key];
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

export const readLocalExecutionMetadata = (
  executionTarget: ProjectRuntimeSessionExecutionTarget,
) => {
  const localExecutionValue = executionTarget.metadata["localExecution"];
  if (!isJsonObject(localExecutionValue)) {
    throw new ConfigurationError(
      "Local execution metadata is required for runtime service exposure",
      "RUNTIME_SERVICE_LOCAL_EXECUTION_UNAVAILABLE",
    );
  }

  const localExecution = localExecutionValue;
  const containerId = readOptionalString(localExecution, "containerId");
  if (!containerId) {
    throw new ConfigurationError(
      "Runtime service exposure requires a local execution container id",
      "RUNTIME_SERVICE_CONTAINER_UNAVAILABLE",
    );
  }

  return {
    containerId,
    workspacePath: readOptionalString(localExecution, "workspacePath"),
    devcontainerConfigPath: readOptionalString(
      localExecution,
      "devcontainerConfigPath",
    ),
    agentContainerId: readOptionalString(localExecution, "agentContainerId"),
  };
};

export const toRuntimeProxyBinaryArchitecture = (
  architecture: string,
): RuntimeProxyBinaryArchitecture => {
  const normalizedArchitecture = architecture.trim();
  if (
    normalizedArchitecture === "amd64" ||
    normalizedArchitecture === "x86_64"
  ) {
    return "x64";
  }

  if (
    normalizedArchitecture === "arm64" ||
    normalizedArchitecture === "aarch64"
  ) {
    return "arm64";
  }

  throw new ConfigurationError(
    `Unsupported devcontainer architecture: ${architecture}`,
    "RUNTIME_PROXY_ARCHITECTURE_UNSUPPORTED",
  );
};

export const normalizeForwardPortValue = (
  value: number | string | undefined,
): number | null => {
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 1 && value <= 65_535) {
      return value;
    }

    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/(\d+)$/u);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    return null;
  }

  return parsed;
};

export const delay = async (milliseconds: number) => {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

export const parseDevcontainerForwardPorts = (
  value: AnyJsonValue,
): number[] => {
  if (!isJsonObject(value)) {
    throw new ConfigurationError(
      "Devcontainer config must be a JSON object",
      "DEVCONTAINER_CONFIG_INVALID",
    );
  }

  const config = value;
  const forwardPorts = config["forwardPorts"];
  if (!Array.isArray(forwardPorts)) {
    return [];
  }

  return [
    ...new Set(
      forwardPorts
        .map((forwardPort) =>
          normalizeForwardPortValue(
            typeof forwardPort === "number" || typeof forwardPort === "string"
              ? forwardPort
              : undefined,
          ),
        )
        .filter((port): port is number => port !== null),
    ),
  ].sort((left, right) => left - right);
};

export const resolveRuntimeProxyMappings = ({
  existingMappings,
  targetPorts,
}: {
  existingMappings: readonly RuntimeProxyMapping[];
  targetPorts: readonly number[];
}): RuntimeProxyMapping[] => {
  const mappingsByTargetPort = new Map<number, RuntimeProxyMapping>(
    existingMappings.map((mapping) => [mapping.targetPort, mapping]),
  );
  const usedListenPorts = new Set<number>(
    existingMappings.map((mapping) => mapping.listenPort),
  );
  const resolvedMappings: RuntimeProxyMapping[] = [];
  let nextListenPort = PROXY_PORT_SEARCH_START;

  const allocateListenPort = (): number => {
    while (
      usedListenPorts.has(nextListenPort) &&
      nextListenPort <= PROXY_PORT_SEARCH_END
    ) {
      nextListenPort += 1;
    }

    if (nextListenPort > PROXY_PORT_SEARCH_END) {
      throw new Error(
        "Unable to allocate a runtime proxy port within the configured range",
      );
    }

    const allocatedPort = nextListenPort;
    usedListenPorts.add(allocatedPort);
    nextListenPort += 1;
    return allocatedPort;
  };

  for (const targetPort of [...new Set(targetPorts)].sort(
    (left, right) => left - right,
  )) {
    const existingMapping = mappingsByTargetPort.get(targetPort);
    if (existingMapping) {
      resolvedMappings.push(existingMapping);
      continue;
    }

    resolvedMappings.push({
      listenPort: allocateListenPort(),
      targetHost: "127.0.0.1",
      targetPort,
      protocol: "tcp",
    });
  }

  return resolvedMappings;
};
