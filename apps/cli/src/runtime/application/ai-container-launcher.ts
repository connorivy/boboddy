import type { UuidV7 } from "../../lib/uuid-v7";
import type { AnyJsonObject } from "../../lib/json";

export type LaunchAiContainerInput = {
  sessionId: UuidV7;
  projectId: UuidV7;
  requestedByUserId: UuidV7;
  workspacePath: string;
  extraEnv?: Record<string, string> | undefined;
  additionalNetworks?: string[] | undefined;
};

export type LaunchAiContainerResult = {
  containerId: string;
  baseUrl: string;
  image: string;
  opencodeLogDirectory: string;
  metadata?: AnyJsonObject | undefined;
};

export type AiContainerLauncher = {
  launch(input: LaunchAiContainerInput): Promise<LaunchAiContainerResult>;
  stop(containerId: string): Promise<void>;
};
