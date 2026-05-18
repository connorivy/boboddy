import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnyJsonObject } from "../../../lib/json";
import { parseJsonc } from "../../../lib/jsonc";

const REQUEST_DIRECTORY_RELATIVE_PATH = ".boboddy/runtime-requests";

export type ProjectOpencodeRuntimeRequest =
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

export type ProjectOpencodeRuntimeResponse = {
  ok: boolean;
  error: string | null;
  data: unknown;
};

const getRequestDirectoryPath = (workspacePath: string): string =>
  path.join(workspacePath, REQUEST_DIRECTORY_RELATIVE_PATH);

export const getProjectOpencodeRuntimeRequestPaths = (input: {
  workspacePath: string;
  requestId: string;
}) => {
  const directoryPath = getRequestDirectoryPath(input.workspacePath);
  return {
    directoryPath,
    requestPath: path.join(directoryPath, `${input.requestId}.request.json`),
    responsePath: path.join(directoryPath, `${input.requestId}.response.json`),
    outputPath: path.join(directoryPath, `${input.requestId}.output`),
  };
};

export const writeProjectOpencodeRuntimeRequest = async (input: {
  workspacePath: string;
  request: ProjectOpencodeRuntimeRequest;
}): Promise<string> => {
  const paths = getProjectOpencodeRuntimeRequestPaths({
    workspacePath: input.workspacePath,
    requestId: input.request.id,
  });
  await mkdir(paths.directoryPath, { recursive: true });
  await rm(paths.responsePath, { force: true });
  await writeFile(
    paths.requestPath,
    `${JSON.stringify(input.request, null, 2)}\n`,
    "utf8",
  );
  return paths.responsePath;
};

export const tryReadProjectOpencodeRuntimeRequest = async (input: {
  workspacePath: string;
  requestId: string;
}): Promise<ProjectOpencodeRuntimeRequest | null> => {
  const { requestPath } = getProjectOpencodeRuntimeRequestPaths(input);
  const exists = await access(requestPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    return null;
  }

  return parseJsonc(await readFile(requestPath, "utf8")) as ProjectOpencodeRuntimeRequest;
};

export const listProjectOpencodeRuntimeRequests = async (
  workspacePath: string,
): Promise<ProjectOpencodeRuntimeRequest[]> => {
  const directoryPath = getRequestDirectoryPath(workspacePath);
  const exists = await access(directoryPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    return [];
  }

  const entries = await readdir(directoryPath, { withFileTypes: true });
  const requestFileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".request.json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const requests = await Promise.all(
    requestFileNames.map(async (fileName) =>
      parseJsonc(
        await readFile(path.join(directoryPath, fileName), "utf8"),
      ) as ProjectOpencodeRuntimeRequest,
    ),
  );

  return requests;
};

export const writeProjectOpencodeRuntimeResponse = async (input: {
  workspacePath: string;
  requestId: string;
  response: ProjectOpencodeRuntimeResponse;
}): Promise<void> => {
  const { responsePath } = getProjectOpencodeRuntimeRequestPaths(input);
  await writeFile(
    responsePath,
    `${JSON.stringify(input.response, null, 2)}\n`,
    "utf8",
  );
};

export const tryReadProjectOpencodeRuntimeResponse = async (input: {
  workspacePath: string;
  requestId: string;
}): Promise<ProjectOpencodeRuntimeResponse | null> => {
  const { responsePath } = getProjectOpencodeRuntimeRequestPaths(input);
  const exists = await access(responsePath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    return null;
  }

  return parseJsonc(
    await readFile(responsePath, "utf8"),
  ) as ProjectOpencodeRuntimeResponse;
};

export const clearProjectOpencodeRuntimeRequestArtifacts = async (input: {
  workspacePath: string;
  requestId: string;
}): Promise<void> => {
  const { requestPath, responsePath, outputPath } = getProjectOpencodeRuntimeRequestPaths(input);
  await Promise.all([
    rm(requestPath, { force: true }),
    rm(responsePath, { force: true }),
    rm(outputPath, { force: true }),
  ]);
};

export const clearProjectOpencodeRuntimeRequest = async (input: {
  workspacePath: string;
  requestId: string;
}): Promise<void> => {
  const { requestPath } = getProjectOpencodeRuntimeRequestPaths(input);
  await rm(requestPath, { force: true });
};

export const clearProjectOpencodeRuntimeResponse = async (input: {
  workspacePath: string;
  requestId: string;
}): Promise<void> => {
  const { responsePath } = getProjectOpencodeRuntimeRequestPaths(input);
  await rm(responsePath, { force: true });
};

export const createProjectOpencodeRuntimeResponse = (input: {
  ok: boolean;
  error?: string | null | undefined;
  data?: unknown;
}): ProjectOpencodeRuntimeResponse => ({
  ok: input.ok,
  error: input.error ?? null,
  data: input.data ?? null,
});

export const toProjectOpencodeRuntimeResultJson = (
  response: ProjectOpencodeRuntimeResponse,
): string => `${JSON.stringify(response, null, 2)}\n`;

export type ProjectOpencodeRuntimeServiceAccess = {
  serviceName: string;
  description: string;
  host: string;
  port: number;
  protocol: string;
  targetPort: number;
  url: string | null;
};

export type ProjectOpencodeRuntimeCommandResult = {
  commandName: string;
  description: string;
  exitCode: number | null;
  signal: string | null;
  stdoutPreview: string;
  stderrPreview: string;
};

export type ProjectOpencodeRuntimeDefinitionList = {
  relativePath: string;
  commands: Array<{
    name: string;
    description: string;
    cwd: string | null;
  }>;
  services: Array<{
    name: string;
    description: string;
    cwd: string | null;
    dependsOn: string[];
    expose: {
      targetPort: number;
      protocol: string;
    };
  }>;
};

export type ProjectOpencodeArbitraryCommandResult = {
  status: "exited" | "running" | "cancelled";
  commandId: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
};

export const isJsonObjectRecord = (value: unknown): value is AnyJsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);
