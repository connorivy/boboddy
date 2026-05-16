import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const REQUEST_DIRECTORY_RELATIVE_PATH = ".boboddy/runtime-requests";

type RuntimeRequest =
  | {
      id: string;
      kind: "list_definitions";
    }
  | {
      id: string;
      kind: "run_command";
      commandName: string;
    }
  | {
      id: string;
      kind: "ensure_service";
      serviceName: string;
    }
  | {
      id: string;
      kind: "run_arbitrary_command";
      command: string;
      dir: string;
      timeoutMs: number;
    }
  | {
      id: string;
      kind: "cancel_command";
      targetId: string;
    };

type RuntimeResponse = {
  ok: boolean;
  error: string | null;
  data: unknown;
};

const getRequestDirectoryPath = (workspacePath: string): string =>
  path.join(workspacePath, REQUEST_DIRECTORY_RELATIVE_PATH);

const getPaths = (workspacePath: string, requestId: string) => {
  const directoryPath = getRequestDirectoryPath(workspacePath);
  return {
    directoryPath,
    requestPath: path.join(directoryPath, `${requestId}.request.json`),
    responsePath: path.join(directoryPath, `${requestId}.response.json`),
  };
};

export async function assertWorkspaceReadable(workspacePath: string) {
  await access(workspacePath, constants.R_OK);
}

export async function writeRuntimeRequest(input: {
  workspacePath: string;
  request: RuntimeRequest;
}) {
  const paths = getPaths(input.workspacePath, input.request.id);
  await mkdir(paths.directoryPath, { recursive: true });
  await rm(paths.responsePath, { force: true });
  await writeFile(
    paths.requestPath,
    `${JSON.stringify(input.request, null, 2)}\n`,
    "utf8",
  );
}

export async function waitForRuntimeResponse(input: {
  workspacePath: string;
  requestId: string;
  timeoutMs: number;
  pollIntervalMs: number;
  timeoutMessage: string;
}): Promise<RuntimeResponse> {
  const deadline = Date.now() + input.timeoutMs;
  const paths = getPaths(input.workspacePath, input.requestId);

  while (Date.now() < deadline) {
    const exists = await access(paths.responsePath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      const response = JSON.parse(
        await readFile(paths.responsePath, "utf8"),
      ) as RuntimeResponse;
      await rm(paths.responsePath, { force: true }).catch(() => undefined);
      return response;
    }

    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
  }

  return {
    ok: false,
    error: input.timeoutMessage,
    data: null,
  };
}

export const toRuntimeResponseJson = (response: RuntimeResponse): string =>
  `${JSON.stringify(response, null, 2)}\n`;
