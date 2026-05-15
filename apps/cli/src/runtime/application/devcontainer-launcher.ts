import type { UuidV7 } from "../../lib/uuid-v7";
import type { AnyJsonObject } from "../../lib/json";

export type ResolveDevcontainerConfigInput = {
  workspacePath: string;
};

export type LaunchDevcontainerInput = {
  sessionId: UuidV7;
  projectId: UuidV7;
  requestedByUserId: UuidV7;
  workspacePath: string;
  devcontainerConfigPath: string;
};

export type LaunchDevcontainerResult = {
  containerId: string;
  metadata?: AnyJsonObject | undefined;
};

export type DevcontainerLauncher = {
  resolveConfigPath(
    input: ResolveDevcontainerConfigInput,
  ): Promise<string>;
  launch(input: LaunchDevcontainerInput): Promise<LaunchDevcontainerResult>;
  stop(containerId: string): Promise<void>;
};
