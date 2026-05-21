import type {
  AnyJsonObject,
  AnyJsonValue,
} from "../../../common/contracts/json";

export const PROJECT_RUNTIME_SESSION_PROJECT_NETWORK_ALIAS = "devcontainer";
export const PROJECT_RUNTIME_SESSION_AGENT_NETWORK_ALIAS = "agent";

export type ProjectRuntimeSessionNetworkMetadata = {
  name: string;
  aliases: {
    project: string;
    agent?: string | undefined;
  };
};

const isJsonObject = (
  value: AnyJsonValue | undefined,
): value is AnyJsonObject =>
  value !== null && value !== undefined && !Array.isArray(value) && typeof value === "object";

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

export const getProjectRuntimeSessionNetworkMetadata = (
  metadata: AnyJsonObject,
): ProjectRuntimeSessionNetworkMetadata | null => {
  const network = metadata["network"];
  if (!isJsonObject(network)) {
    return null;
  }

  const aliases = network["aliases"];
  if (!isJsonObject(aliases)) {
    return null;
  }

  const name = readOptionalString(network, "name");
  const projectAlias = readOptionalString(aliases, "project");
  const agentAlias = readOptionalString(aliases, "agent");

  if (!name || !projectAlias) {
    return null;
  }

  return {
    name,
    aliases: {
      project: projectAlias,
      ...(agentAlias ? { agent: agentAlias } : {}),
    },
  };
};

export const setProjectRuntimeSessionNetworkMetadata = ({
  metadata,
  network,
}: {
  metadata: AnyJsonObject;
  network: ProjectRuntimeSessionNetworkMetadata;
}): AnyJsonObject => ({
  ...metadata,
  network: {
    name: network.name,
    aliases: {
      project: network.aliases.project,
      ...(network.aliases.agent ? { agent: network.aliases.agent } : {}),
    },
  },
});
