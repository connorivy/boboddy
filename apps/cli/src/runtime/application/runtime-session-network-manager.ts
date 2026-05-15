import type { UuidV7 } from "../../lib/uuid-v7";

export type CreateRuntimeSessionNetworkResult = {
  networkName: string;
};

export type AttachRuntimeSessionContainerInput = {
  networkName: string;
  containerId: string;
  alias?: string | undefined;
};

export type RuntimeSessionNetworkManager = {
  createNetwork(
    sessionId: UuidV7,
  ): Promise<CreateRuntimeSessionNetworkResult>;
  attachContainer(input: AttachRuntimeSessionContainerInput): Promise<void>;
  removeNetwork(networkName: string): Promise<void>;
};
