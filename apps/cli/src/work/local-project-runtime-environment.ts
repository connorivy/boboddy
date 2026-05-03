import { buildOpencodeContext } from "@boboddy/opencode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { UuidV7 } from "@boboddy/core/common/contracts/uuid-v7";
import type {
  StepExecutionRuntimeEnvironment,
  StepExecutionRuntimeEnvironmentOrchestrator,
} from "@boboddy/core/pipeline-executions/step-execution/application/process-project-work";
import type { AiContainerLauncher } from "@boboddy/core/agent-sessions/project-runtime-session/application/ai-container-launcher";
import type { DevcontainerLauncher } from "@boboddy/core/agent-sessions/project-runtime-session/application/devcontainer-launcher";
import type { GitCloneService } from "@boboddy/core/agent-sessions/project-runtime-session/application/git-clone-service";
import {
  PROJECT_RUNTIME_SESSION_AGENT_NETWORK_ALIAS,
  PROJECT_RUNTIME_SESSION_PROJECT_NETWORK_ALIAS,
} from "@boboddy/core/agent-sessions/project-runtime-session/application/project-runtime-session-network-metadata";
import type { RuntimeSessionNetworkManager } from "@boboddy/core/agent-sessions/project-runtime-session/application/runtime-session-network-manager";
import type { WorkspaceManager } from "@boboddy/core/agent-sessions/project-runtime-session/application/workspace-manager";
import { DockerAiContainerLauncher } from "@boboddy/core/agent-sessions/project-runtime-session/infra/docker-ai-container-launcher";
import { DevcontainerCliLauncher } from "@boboddy/core/agent-sessions/project-runtime-session/infra/devcontainer-cli-launcher";
import { GitCliCloneService } from "@boboddy/core/agent-sessions/project-runtime-session/infra/git-cli-clone-service";
import { LocalDockerRuntimeSessionNetworkManager } from "@boboddy/core/agent-sessions/project-runtime-session/infra/local-docker-runtime-session-network-manager";
import { LocalWorkspaceManager } from "@boboddy/core/agent-sessions/project-runtime-session/infra/local-workspace-manager";
import { logWork } from "./work-logger";

const execFileAsync = promisify(execFile);

async function inspectContainerHealthStatus(containerId: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      "--format",
      "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
      containerId,
    ]);
    return stdout.trim() || "unknown";
  } catch (error) {
    return `unreachable:${error instanceof Error ? error.message : String(error)}`;
  }
}

export type LocalProjectRuntimeEnvironment = StepExecutionRuntimeEnvironment;

export type LocalProjectRuntimeEnvironmentOrchestrator =
  StepExecutionRuntimeEnvironmentOrchestrator;

export class DefaultLocalProjectRuntimeEnvironmentOrchestrator implements LocalProjectRuntimeEnvironmentOrchestrator {
  constructor(
    private readonly deps: {
      workspaceManager: WorkspaceManager;
      gitCloneService: GitCloneService;
      devcontainerLauncher: DevcontainerLauncher;
      aiContainerLauncher: AiContainerLauncher;
      runtimeSessionNetworkManager: RuntimeSessionNetworkManager;
    } = {
      workspaceManager: new LocalWorkspaceManager(),
      gitCloneService: new GitCliCloneService(),
      devcontainerLauncher: new DevcontainerCliLauncher(),
      aiContainerLauncher: new DockerAiContainerLauncher(),
      runtimeSessionNetworkManager:
        new LocalDockerRuntimeSessionNetworkManager(),
    },
  ) {}

  async launch(input: {
    sessionId: UuidV7;
    projectId: UuidV7;
    requestedByUserId: UuidV7;
    gitUrl: string;
    requestedBranch?: string | null | undefined;
  }): Promise<LocalProjectRuntimeEnvironment> {
    let workspacePath: string | null = null;
    let devcontainerId: string | null = null;
    let aiContainerId: string | null = null;
    let networkName: string | null = null;

    try {
      logWork("runtime", "Creating local runtime environment", {
        sessionId: input.sessionId,
        projectId: input.projectId,
        requestedByUserId: input.requestedByUserId,
        gitUrl: input.gitUrl,
        requestedBranch: input.requestedBranch ?? null,
      });

      const workspace = await this.deps.workspaceManager.createWorkspace({
        sessionId: input.sessionId,
      });
      workspacePath = workspace.workspacePath;
      logWork("runtime", "Workspace created", {
        sessionId: input.sessionId,
        workspacePath,
      });

      const cloneResult = await this.deps.gitCloneService.cloneRepository({
        gitUrl: input.gitUrl,
        workspacePath,
        requestedBranch: input.requestedBranch ?? null,
      });
      logWork("runtime", "Repository cloned into workspace", {
        sessionId: input.sessionId,
        workspacePath,
        resolvedBranch: cloneResult.resolvedBranch,
      });

      await buildOpencodeContext({ workspacePath });
      logWork("runtime", "OpenCode context built", {
        sessionId: input.sessionId,
        workspacePath,
      });

      const devcontainerConfigPath =
        await this.deps.devcontainerLauncher.resolveConfigPath({
          workspacePath,
        });
      logWork("runtime", "Resolved devcontainer config", {
        sessionId: input.sessionId,
        devcontainerConfigPath,
      });

      const [devcontainerResult, aiContainerResult] = await Promise.all([
        this.deps.devcontainerLauncher.launch({
          sessionId: input.sessionId,
          projectId: input.projectId,
          requestedByUserId: input.requestedByUserId,
          workspacePath,
          devcontainerConfigPath,
        }),
        this.deps.aiContainerLauncher.launch({
          sessionId: input.sessionId,
          projectId: input.projectId,
          requestedByUserId: input.requestedByUserId,
          workspacePath,
        }),
      ]);
      devcontainerId = devcontainerResult.containerId;
      aiContainerId = aiContainerResult.containerId;
      logWork("runtime", "Runtime containers launched", {
        sessionId: input.sessionId,
        devcontainerId,
        aiContainerId,
        aiBaseUrl: aiContainerResult.baseUrl,
        aiImage: aiContainerResult.image,
      });

      const network =
        await this.deps.runtimeSessionNetworkManager.createNetwork(
          input.sessionId,
        );
      networkName = network.networkName;
      logWork("runtime", "Runtime network created", {
        sessionId: input.sessionId,
        networkName,
      });

      await this.deps.runtimeSessionNetworkManager.attachContainer({
        networkName,
        containerId: devcontainerId,
        alias: PROJECT_RUNTIME_SESSION_PROJECT_NETWORK_ALIAS,
      });
      logWork("runtime", "Attached project container to runtime network", {
        sessionId: input.sessionId,
        networkName,
        containerId: devcontainerId,
        alias: PROJECT_RUNTIME_SESSION_PROJECT_NETWORK_ALIAS,
      });
      await this.deps.runtimeSessionNetworkManager.attachContainer({
        networkName,
        containerId: aiContainerId,
        alias: PROJECT_RUNTIME_SESSION_AGENT_NETWORK_ALIAS,
      });
      logWork("runtime", "Attached agent container to runtime network", {
        sessionId: input.sessionId,
        networkName,
        containerId: aiContainerId,
        alias: PROJECT_RUNTIME_SESSION_AGENT_NETWORK_ALIAS,
      });

      logWork("runtime", "Local runtime environment ready", {
        sessionId: input.sessionId,
        workspacePath,
        resolvedBranch: cloneResult.resolvedBranch,
        devcontainerConfigPath,
        devcontainerId,
        aiContainerId,
        aiBaseUrl: aiContainerResult.baseUrl,
        aiImage: aiContainerResult.image,
        networkName,
      });

      return {
        workspacePath,
        resolvedBranch: cloneResult.resolvedBranch,
        devcontainerConfigPath,
        devcontainerId,
        aiContainerId,
        aiBaseUrl: aiContainerResult.baseUrl,
        aiImage: aiContainerResult.image,
        networkName,
        checkContainerHealth: async () => ({
          devcontainerStatus: await inspectContainerHealthStatus(devcontainerId!),
          aiContainerStatus: await inspectContainerHealthStatus(aiContainerId!),
        }),
        cleanup: async () => {
          await cleanupEnvironment({
            workspacePath,
            devcontainerId,
            aiContainerId,
            networkName,
            deps: this.deps,
          });
        },
      };
    } catch (error) {
      logWork("runtime", "Runtime environment launch failed; cleaning up", {
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      await cleanupEnvironment({
        workspacePath,
        devcontainerId,
        aiContainerId,
        networkName,
        deps: this.deps,
      });
      throw error;
    }
  }
}

async function cleanupEnvironment(input: {
  workspacePath: string | null;
  devcontainerId: string | null;
  aiContainerId: string | null;
  networkName: string | null;
  deps: {
    workspaceManager: WorkspaceManager;
    devcontainerLauncher: DevcontainerLauncher;
    aiContainerLauncher: AiContainerLauncher;
    runtimeSessionNetworkManager: RuntimeSessionNetworkManager;
  };
}) {
  logWork("runtime", "Cleaning up local runtime environment", {
    workspacePath: input.workspacePath,
    devcontainerId: input.devcontainerId,
    aiContainerId: input.aiContainerId,
    networkName: input.networkName,
  });

  await Promise.allSettled([
    input.networkName
      ? input.deps.runtimeSessionNetworkManager.removeNetwork(input.networkName)
      : Promise.resolve(),
    input.devcontainerId
      ? input.deps.devcontainerLauncher.stop(input.devcontainerId)
      : Promise.resolve(),
    input.aiContainerId
      ? input.deps.aiContainerLauncher.stop(input.aiContainerId)
      : Promise.resolve(),
    input.workspacePath
      ? input.deps.workspaceManager.removeWorkspace(input.workspacePath)
      : Promise.resolve(),
  ]);

  logWork("runtime", "Local runtime environment cleanup complete", {
    workspacePath: input.workspacePath,
    devcontainerId: input.devcontainerId,
    aiContainerId: input.aiContainerId,
    networkName: input.networkName,
  });
}
