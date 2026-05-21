import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type {
  EnsureDefaultRuntimeServiceAccessPointsInput,
  EnsureRuntimeServiceAccessPointInput,
  RuntimeSessionServiceExposureProvider,
} from "../application/runtime-session-service-exposure-provider";
import {
  createRuntimeServiceAccessPoint,
  type RuntimeServiceAccessPoint,
} from "../domain/runtime-service-access-point";
import type { ProjectRuntimeSessionExecutionTarget } from "../domain/project-runtime-session-execution-target";
import { parseDevcontainerForwardPortsFromContent } from "./local-devcontainer-jsonc";
import {
  AGENT_PROXY_BINARY_PATH,
  AGENT_PROXY_CONFIG_PATH,
  AGENT_PROXY_DIRECTORY_PATH,
  AGENT_PROXY_LOG_PATH,
  AGENT_PROXY_PID_PATH,
  PROXY_BINARY_PATH,
  PROXY_BOOT_WAIT_MS,
  PROXY_CONFIG_PATH,
  PROXY_DIRECTORY_PATH,
  PROXY_LOG_PATH,
  PROXY_PID_PATH,
  delay,
  parseRuntimeProxyMappingsContent,
  readLocalExecutionMetadata,
  resolveRuntimeProxyMappings,
  toRuntimeProxyBinaryArchitecture,
  type RuntimeProxyBinaryArchitecture,
  type RuntimeProxyConfig,
  type RuntimeProxyMapping,
} from "./local-devcontainer-port-forward-manager-support";

const execFileAsync = promisify(execFile);
const localProxyBinaryCache = new Map<
  RuntimeProxyBinaryArchitecture,
  Promise<Uint8Array>
>();

type ProxyPaths = {
  dir: string;
  binary: string;
  config: string;
  log: string;
  pid: string;
};

const devcontainerProxyPaths: ProxyPaths = {
  dir: PROXY_DIRECTORY_PATH,
  binary: PROXY_BINARY_PATH,
  config: PROXY_CONFIG_PATH,
  log: PROXY_LOG_PATH,
  pid: PROXY_PID_PATH,
};

const agentProxyPaths: ProxyPaths = {
  dir: AGENT_PROXY_DIRECTORY_PATH,
  binary: AGENT_PROXY_BINARY_PATH,
  config: AGENT_PROXY_CONFIG_PATH,
  log: AGENT_PROXY_LOG_PATH,
  pid: AGENT_PROXY_PID_PATH,
};

async function injectIntoContainer(
  containerId: string,
  data: Uint8Array | string,
  dirPath: string,
  filePath: string,
): Promise<void> {
  const bytes =
    typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  return new Promise<void>((resolve, reject) => {
    const proc = spawn("docker", [
      "exec",
      "-i",
      containerId,
      "sh",
      "-c",
      `mkdir -p '${dirPath}' && cat > '${filePath}.tmp' && mv '${filePath}.tmp' '${filePath}'`,
    ]);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.stdin.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") reject(err);
    });
    proc.on("error", reject);
    proc.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(
          `Failed to inject file into container at ${filePath}${stderr ? `: ${stderr.trim()}` : ""}`,
        ));
      } else {
        resolve();
      }
    });
    proc.stdin.end(bytes);
  });
}

async function readStartupLog(
  containerId: string,
  logPath: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("docker", [
      "exec",
      containerId,
      "sh",
      "-lc",
      `if [ -f '${logPath}' ]; then cat '${logPath}'; fi`,
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function setupContainerProxy(
  containerId: string,
  binaryData: Uint8Array,
  configJson: string,
  paths: ProxyPaths,
  errorLabel: string,
): Promise<void> {
  await Promise.all([
    injectIntoContainer(containerId, binaryData, paths.dir, paths.binary),
    injectIntoContainer(containerId, configJson, paths.dir, paths.config),
  ]);

  await execFileAsync("docker", [
    "exec",
    containerId,
    "sh",
    "-lc",
    `if [ -f '${paths.pid}' ]; then pid=$(cat '${paths.pid}'); kill "$pid" 2>/dev/null || true; rm -f '${paths.pid}'; fi; chmod +x '${paths.binary}'; nohup '${paths.binary}' proxy --config '${paths.config}' >'${paths.log}' 2>&1 < /dev/null & echo $! >'${paths.pid}'`,
  ]);

  await delay(PROXY_BOOT_WAIT_MS);

  try {
    await execFileAsync("docker", [
      "exec",
      containerId,
      "sh",
      "-lc",
      `pid=$(cat '${paths.pid}'); kill -0 "$pid"`,
    ]);
  } catch {
    const log = await readStartupLog(containerId, paths.log);
    throw new Error(log ? `${errorLabel}: ${log}` : errorLabel);
  }
}

export class LocalDevcontainerPortForwardManager
  implements RuntimeSessionServiceExposureProvider
{
  async ensureDefaultAccessPoints(
    input: EnsureDefaultRuntimeServiceAccessPointsInput,
  ): Promise<
    (RuntimeServiceAccessPoint & {
      targetPort: number;
    })[]
  > {
    const targetPorts = await this.readForwardPorts(
      input.workspacePath,
      input.devcontainerConfigPath,
    );

    if (targetPorts.length === 0) {
      return [];
    }

    const mappings = await this.ensureProxy(input.executionTarget, targetPorts);

    return mappings.map((mapping) => ({
      targetPort: mapping.targetPort,
      ...createRuntimeServiceAccessPoint({
        host: "devcontainer",
        port: mapping.listenPort,
        protocol: mapping.protocol,
      }),
    }));
  }

  async ensureAccessPoint(
    input: EnsureRuntimeServiceAccessPointInput,
  ): Promise<
    RuntimeServiceAccessPoint & {
      targetPort: number;
    }
  > {
    const targetPorts = await this.readForwardPorts(
      input.workspacePath,
      input.devcontainerConfigPath,
    );
    const allTargetPorts = [...new Set([...targetPorts, input.targetPort])];

    const mappings = await this.ensureProxy(
      input.executionTarget,
      allTargetPorts,
    );
    const mapping = mappings.find(
      (candidate) => candidate.targetPort === input.targetPort,
    );

    if (!mapping) {
      throw new Error(
        `Expected runtime proxy mapping for target port ${String(input.targetPort)}`,
      );
    }

    return {
      targetPort: mapping.targetPort,
      ...createRuntimeServiceAccessPoint({
        host: "devcontainer",
        port: mapping.listenPort,
        protocol: input.protocol,
      }),
    };
  }

  async stop(
    executionTarget: ProjectRuntimeSessionExecutionTarget,
  ): Promise<void> {
    const { containerId, agentContainerId } =
      readLocalExecutionMetadata(executionTarget);

    try {
      await execFileAsync("docker", [
        "exec",
        containerId,
        "sh",
        "-lc",
        `if [ -f '${PROXY_PID_PATH}' ]; then pid=$(cat '${PROXY_PID_PATH}'); kill "$pid" 2>/dev/null || true; fi; rm -rf '${PROXY_DIRECTORY_PATH}'`,
      ]);
    } catch {
      // Ignore missing or already-stopped containers.
    }

    if (agentContainerId) {
      try {
        await execFileAsync("docker", [
          "exec",
          agentContainerId,
          "sh",
          "-lc",
          `if [ -f '${AGENT_PROXY_PID_PATH}' ]; then pid=$(cat '${AGENT_PROXY_PID_PATH}'); kill "$pid" 2>/dev/null || true; fi; rm -rf '${AGENT_PROXY_DIRECTORY_PATH}'`,
        ]);
      } catch {
        // Ignore missing or already-stopped containers.
      }
    }
  }

  private async ensureProxy(
    executionTarget: ProjectRuntimeSessionExecutionTarget,
    targetPorts: readonly number[],
  ): Promise<RuntimeProxyMapping[]> {
    const { containerId, agentContainerId } =
      readLocalExecutionMetadata(executionTarget);

    const [binaryData, mappings] = await Promise.all([
      this.getProxyBinaryData(containerId),
      this.resolveMappings(containerId, targetPorts),
    ]);

    const devConfigJson = `${JSON.stringify({ mappings } satisfies RuntimeProxyConfig, null, 2)}\n`;

    const tasks: Promise<void>[] = [
      setupContainerProxy(
        containerId,
        binaryData,
        devConfigJson,
        devcontainerProxyPaths,
        "Failed to start runtime proxy",
      ),
    ];

    if (agentContainerId) {
      const agentMappings: RuntimeProxyMapping[] = mappings.map((m) => ({
        listenPort: m.targetPort,
        targetHost: "devcontainer",
        targetPort: m.listenPort,
        protocol: m.protocol,
      }));
      const agentConfigJson = `${JSON.stringify({ mappings: agentMappings } satisfies RuntimeProxyConfig, null, 2)}\n`;
      tasks.push(
        setupContainerProxy(
          agentContainerId,
          binaryData,
          agentConfigJson,
          agentProxyPaths,
          "Failed to start agent proxy",
        ),
      );
    }

    await Promise.all(tasks);
    return mappings;
  }

  private async resolveMappings(
    containerId: string,
    targetPorts: readonly number[],
  ): Promise<RuntimeProxyMapping[]> {
    const existingMappings = await this.readExistingMappings(containerId);
    return resolveRuntimeProxyMappings({
      existingMappings,
      targetPorts,
    });
  }

  private async readExistingMappings(
    containerId: string,
  ): Promise<RuntimeProxyMapping[]> {
    try {
      const { stdout } = await execFileAsync("docker", [
        "exec",
        containerId,
        "sh",
        "-lc",
        `if [ -f '${PROXY_CONFIG_PATH}' ]; then cat '${PROXY_CONFIG_PATH}'; fi`,
      ]);
      const content = stdout.trim();
      if (!content) {
        return [];
      }

      return parseRuntimeProxyMappingsContent(content);
    } catch {
      return [];
    }
  }

  private async getProxyBinaryData(
    containerId: string,
  ): Promise<Uint8Array> {
    const architecture = await this.readContainerArchitecture(containerId);
    const cached = localProxyBinaryCache.get(architecture);
    if (cached) return cached;
    const promise = loadProxyBinaryData(architecture);
    localProxyBinaryCache.set(architecture, promise);
    return promise;
  }

  private async readContainerArchitecture(
    containerId: string,
  ): Promise<RuntimeProxyBinaryArchitecture> {
    const { stdout } = await execFileAsync("docker", [
      "exec",
      containerId,
      "uname",
      "-m",
    ]);

    return toRuntimeProxyBinaryArchitecture(stdout);
  }

  private async readForwardPorts(
    workspacePath: string,
    devcontainerConfigPath: string,
  ): Promise<number[]> {
    const configContent = await readFile(
      path.join(workspacePath, devcontainerConfigPath),
      "utf8",
    );
    return parseDevcontainerForwardPortsFromContent(configContent);
  }
}

async function loadProxyBinaryData(
  architecture: RuntimeProxyBinaryArchitecture,
): Promise<Uint8Array> {
  const binaryName = `boboddy-linux-${architecture}`;
  const candidatePaths = [
    // Production: sibling of the running CLI binary (npm-installed layout).
    path.join(path.dirname(process.execPath), binaryName),
    // Dev: built CLI binaries in apps/cli/dist relative to this source file.
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../dist",
      binaryName,
    ),
  ];

  for (const candidate of candidatePaths) {
    const file = Bun.file(candidate);
    if (await file.exists()) {
      return new Uint8Array(await file.arrayBuffer());
    }
  }

  throw new Error(
    `Could not find Linux CLI binary "${binaryName}". Tried:\n` +
      candidatePaths.map((p) => `  - ${p}`).join("\n") +
      `\nIn dev, run 'bun run --filter @boboddy/cli build' to produce the binaries.`,
  );
}
