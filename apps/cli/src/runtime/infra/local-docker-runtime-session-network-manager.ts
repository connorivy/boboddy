import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { UuidV7 } from "../../lib/uuid-v7";
import type {
  AttachRuntimeSessionContainerInput,
  CreateRuntimeSessionNetworkResult,
  RuntimeSessionNetworkManager,
} from "../application/runtime-session-network-manager";

const execFileAsync = promisify(execFile);
export const RUNTIME_SESSION_NETWORK_NAME_PREFIX =
  "boboddy-project-runtime-session";
const NETWORK_REMOVAL_MAX_ATTEMPTS = 6;
const NETWORK_REMOVAL_RETRY_DELAY_MS = 200;
const NETWORK_ROLE_LABEL = "boboddy.runtime-role=session-network";
const NETWORK_SESSION_LABEL_PREFIX = "boboddy.project-runtime-session-id=";

type ErrorLike =
  | Error
  | { message?: string | undefined }
  | string
  | null
  | undefined;

const readErrorMessage = (error: ErrorLike) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error?.message) {
    return error.message;
  }

  return "Unknown error";
};

const isMissingNetworkError = (error: ErrorLike) => {
  const message = readErrorMessage(error);
  return /network [^ ]+ not found|No such network/u.test(message);
};

const isNetworkBusyError = (error: ErrorLike) => {
  const message = readErrorMessage(error);
  return /active endpoints|resource is still in use|resource is in use|endpoint .* exists/u.test(
    message,
  );
};

const isNetworkAlreadyExistsError = (error: ErrorLike) => {
  const message = readErrorMessage(error);
  return /already exists/u.test(message);
};

const delay = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const createRuntimeSessionNetworkName = (sessionId: string) =>
  `${RUNTIME_SESSION_NETWORK_NAME_PREFIX}-${sessionId}`;

type DockerNetworkInspect = {
  Containers?: Record<string, unknown> | null | undefined;
};

export class LocalDockerRuntimeSessionNetworkManager implements RuntimeSessionNetworkManager {
  constructor(
    private readonly deps: {
      execFileAsync(
        file: string,
        args: string[],
      ): Promise<{ stdout: string; stderr: string }>;
    } = { execFileAsync },
  ) {}

  private async inspectNetwork(
    networkName: string,
  ): Promise<DockerNetworkInspect | null> {
    try {
      const { stdout } = await this.deps.execFileAsync("docker", [
        "network",
        "inspect",
        networkName,
      ]);
      const [network] = JSON.parse(stdout) as DockerNetworkInspect[];
      return network ?? null;
    } catch (error) {
      if (isMissingNetworkError(error as ErrorLike)) {
        return null;
      }

      const message = readErrorMessage(error as ErrorLike);
      throw new Error(
        `Failed to inspect runtime session network ${networkName}: ${message}`,
        { cause: error },
      );
    }
  }

  private async recreateEmptyExistingNetwork(
    networkName: string,
  ): Promise<boolean> {
    const network = await this.inspectNetwork(networkName);
    const containerCount = Object.keys(network?.Containers ?? {}).length;

    if (containerCount > 0) {
      return false;
    }

    await this.removeNetwork(networkName);
    return true;
  }

  async createNetwork(
    sessionId: UuidV7,
  ): Promise<CreateRuntimeSessionNetworkResult> {
    const networkName = createRuntimeSessionNetworkName(sessionId);
    const createArgs = [
      "network",
      "create",
      "--label",
      NETWORK_ROLE_LABEL,
      "--label",
      `${NETWORK_SESSION_LABEL_PREFIX}${sessionId}`,
      networkName,
    ];

    try {
      await this.deps.execFileAsync("docker", createArgs);
      return { networkName };
    } catch (error) {
      if (isNetworkAlreadyExistsError(error as ErrorLike)) {
        const removedExistingNetwork =
          await this.recreateEmptyExistingNetwork(networkName);

        if (removedExistingNetwork) {
          await this.deps.execFileAsync("docker", createArgs);
          return { networkName };
        }
      }

      const message = readErrorMessage(error as ErrorLike);
      throw new Error(
        `Failed to create runtime session network ${networkName}: ${message}`,
        { cause: error },
      );
    }
  }

  async attachContainer({
    networkName,
    containerId,
    alias,
  }: AttachRuntimeSessionContainerInput): Promise<void> {
    const args = ["network", "connect"];
    if (alias) {
      args.push("--alias", alias);
    }
    args.push(networkName, containerId);

    try {
      await this.deps.execFileAsync("docker", args);
    } catch (error) {
      const message = readErrorMessage(error as ErrorLike);
      throw new Error(
        `Failed to attach container ${containerId} to runtime session network ${networkName}: ${message}`,
        { cause: error },
      );
    }
  }

  async removeNetwork(networkName: string): Promise<void> {
    let lastError: ErrorLike = null;

    for (
      let attempt = 1;
      attempt <= NETWORK_REMOVAL_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await this.deps.execFileAsync("docker", ["network", "rm", networkName]);
        return;
      } catch (error) {
        if (isMissingNetworkError(error as ErrorLike)) {
          return;
        }

        lastError = error as ErrorLike;

        if (
          !isNetworkBusyError(lastError) ||
          attempt === NETWORK_REMOVAL_MAX_ATTEMPTS
        ) {
          break;
        }

        await delay(NETWORK_REMOVAL_RETRY_DELAY_MS);
      }
    }

    const message = readErrorMessage(lastError);
    throw new Error(
      `Failed to remove runtime session network ${networkName}: ${message}`,
    );
  }
}
