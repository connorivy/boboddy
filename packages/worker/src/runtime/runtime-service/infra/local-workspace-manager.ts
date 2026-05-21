import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { WorkspaceManager } from "../application/workspace-manager";

const execFileAsync = promisify(execFile);
const DEFAULT_ROOT_DIR = path.join(
  os.tmpdir(),
  "boboddy-project-runtime-sessions",
);
const WORKSPACE_CLEANUP_IMAGE = "alpine:3.20";

function isPermissionError(
  error: Error | NodeJS.ErrnoException | null | undefined,
): boolean {
  return (
    error instanceof Error &&
    ("code" in error ? error.code === "EACCES" || error.code === "EPERM" : false)
  );
}

async function removeWorkspaceWithHostFs(workspacePath: string): Promise<void> {
  await rm(workspacePath, { recursive: true, force: true });
}

async function removeWorkspaceWithDocker(workspacePath: string): Promise<void> {
  await execFileAsync("docker", [
    "run",
    "--rm",
    "-v",
    `${workspacePath}:/workspace`,
    "--entrypoint",
    "sh",
    WORKSPACE_CLEANUP_IMAGE,
    "-lc",
    "chmod -R 0777 /workspace 2>/dev/null || true; rm -rf /workspace/* /workspace/.[!.]* /workspace/..?*",
  ]);
}

async function removeWorkspacePath(workspacePath: string): Promise<void> {
  try {
    await removeWorkspaceWithHostFs(workspacePath);
  } catch (error) {
    if (!isPermissionError(error instanceof Error ? error : undefined)) {
      throw error;
    }

    await removeWorkspaceWithDocker(workspacePath);
    await removeWorkspaceWithHostFs(workspacePath);
  }
}

export class LocalWorkspaceManager implements WorkspaceManager {
  constructor(private readonly rootDir = DEFAULT_ROOT_DIR) {}

  async createWorkspace(input: {
    sessionId: string;
  }): Promise<{ workspacePath: string }> {
    const workspacePath = path.join(this.rootDir, input.sessionId);
    await removeWorkspacePath(workspacePath);
    await mkdir(workspacePath, { recursive: true });
    return { workspacePath };
  }

  async removeWorkspace(workspacePath: string): Promise<void> {
    await removeWorkspacePath(workspacePath);
  }
}
