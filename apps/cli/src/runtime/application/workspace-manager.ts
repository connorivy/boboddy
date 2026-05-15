import type { UuidV7 } from "../../lib/uuid-v7";

export type ProvisionedWorkspace = {
  workspacePath: string;
};

export type WorkspaceManager = {
  createWorkspace(input: { sessionId: UuidV7 }): Promise<ProvisionedWorkspace>;
  removeWorkspace(workspacePath: string): Promise<void>;
};
