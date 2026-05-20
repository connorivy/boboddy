import { clearProjectOpencodeRuntimeRequest, createProjectOpencodeRuntimeResponse, listProjectOpencodeRuntimeRequests, writeProjectOpencodeRuntimeResponse } from "../../opencode-runtime/application/project-opencode-runtime-requests";
import type { ProjectOpencodeRuntimeActions } from "../../opencode-runtime/application/project-opencode-runtime-actions";
import type { startProcessClaimedExecution } from "./process-claimed-step-execution";
import type { ProcessProjectWorkDeps } from "../contracts/process-project-work-types";

export function isExpectedStepOutputFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(
      "without findings submission via boboddy-submit-step-findings",
    )
  );
}

export async function tryProcessRuntimeRequest(
  _deps: ProcessProjectWorkDeps,
  startedExecution: Awaited<ReturnType<typeof startProcessClaimedExecution>>,
  runtimeActions: ProjectOpencodeRuntimeActions | null,
): Promise<void> {
  if (!runtimeActions) {
    return;
  }

  const requests = await listProjectOpencodeRuntimeRequests(
    startedExecution.environment.workspacePath,
  );
  if (requests.length === 0) {
    return;
  }
  for (const request of requests) {
    await clearProjectOpencodeRuntimeRequest({
      workspacePath: startedExecution.environment.workspacePath,
      requestId: request.id,
    }).catch(() => undefined);

    if (request.kind === "run_arbitrary_command") {
      // Non-blocking: the action writes the response asynchronously after timeout/exit.
      runtimeActions.startArbitraryCommand({
        workspacePath: startedExecution.environment.workspacePath,
        devcontainerConfigPath: startedExecution.environment.devcontainerConfigPath,
        devcontainerId: startedExecution.environment.devcontainerId,
        aiContainerId: startedExecution.environment.aiContainerId,
        requestId: request.id,
        command: request.command,
        dir: request.dir,
        timeoutMs: request.timeoutMs,
      });
      continue;
    }

    if (request.kind === "cancel_command") {
      const cancelled = runtimeActions.cancelArbitraryCommand(request.targetId);
      await writeProjectOpencodeRuntimeResponse({
        workspacePath: startedExecution.environment.workspacePath,
        requestId: request.id,
        response: createProjectOpencodeRuntimeResponse({
          ok: true,
          data: { cancelled, commandId: request.targetId },
        }),
      });
      continue;
    }

    try {
      const data =
        request.kind === "list_definitions"
          ? await runtimeActions.listDefinitions(
              startedExecution.environment.workspacePath,
            )
          : request.kind === "run_command"
            ? await runtimeActions.runCommand({
                workspacePath: startedExecution.environment.workspacePath,
                devcontainerConfigPath:
                  startedExecution.environment.devcontainerConfigPath,
                devcontainerId: startedExecution.environment.devcontainerId,
                aiContainerId: startedExecution.environment.aiContainerId,
                commandName: request.commandName,
              })
            : await runtimeActions.ensureService({
                workspacePath: startedExecution.environment.workspacePath,
                devcontainerConfigPath:
                  startedExecution.environment.devcontainerConfigPath,
                devcontainerId: startedExecution.environment.devcontainerId,
                aiContainerId: startedExecution.environment.aiContainerId,
                serviceName: request.serviceName,
                projectId: startedExecution.projectId,
                projectRuntimeSessionId: startedExecution.localRuntimeSessionId,
              });

      await writeProjectOpencodeRuntimeResponse({
        workspacePath: startedExecution.environment.workspacePath,
        requestId: request.id,
        response: createProjectOpencodeRuntimeResponse({
          ok: true,
          data,
        }),
      });
    } catch (error) {
      await writeProjectOpencodeRuntimeResponse({
        workspacePath: startedExecution.environment.workspacePath,
        requestId: request.id,
        response: createProjectOpencodeRuntimeResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      });
    }
  }
}
