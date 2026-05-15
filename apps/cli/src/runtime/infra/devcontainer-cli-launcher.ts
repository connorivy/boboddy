import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { ConfigurationError } from "../../lib/errors";
import type {
  DevcontainerLauncher,
  LaunchDevcontainerInput,
  LaunchDevcontainerResult,
  ResolveDevcontainerConfigInput,
} from "../application/devcontainer-launcher";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const DEVCONTAINER_CONFIG_CANDIDATES = [
  ".devcontainer/devcontainer.json",
  "devcontainer.json",
] as const;

let cachedDevcontainerCliScriptPath: string | null = null;

async function resolveDevcontainerCliScriptPath(): Promise<string> {
  if (cachedDevcontainerCliScriptPath) {
    return cachedDevcontainerCliScriptPath;
  }

  const packageJsonPath = require.resolve("@devcontainers/cli/package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const packageDir = path.dirname(packageJsonPath);
  const binField = packageJson.bin;
  const binPath =
    typeof binField === "string"
      ? binField
      : (binField?.["devcontainer"] ?? binField?.["@devcontainers/cli"]);

  if (!binPath) {
    throw new ConfigurationError(
      "Could not resolve the devcontainer CLI binary",
      "DEVCONTAINER_CLI_NOT_FOUND",
    );
  }

  cachedDevcontainerCliScriptPath = path.join(packageDir, binPath);
  return cachedDevcontainerCliScriptPath;
}

function extractContainerId(output: string): string | null {
  const directMatch = output.match(/"containerId"\s*:\s*"([^"]+)"/u);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  return null;
}

async function runDevcontainerCli(args: string[]): Promise<string> {
  const cliScriptPath = await resolveDevcontainerCliScriptPath();
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    cliScriptPath,
    ...args,
  ]);

  return [stdout, stderr].filter(Boolean).join("\n");
}

export class DevcontainerCliLauncher implements DevcontainerLauncher {
  async resolveConfigPath(
    input: ResolveDevcontainerConfigInput,
  ): Promise<string> {
    for (const candidate of DEVCONTAINER_CONFIG_CANDIDATES) {
      try {
        await access(path.join(input.workspacePath, candidate));
        return candidate;
      } catch {
        // Try the next candidate.
      }
    }

    throw new Error(
      `No devcontainer spec found in ${input.workspacePath}. Expected .devcontainer/devcontainer.json or devcontainer.json`,
    );
  }

  async launch(
    input: LaunchDevcontainerInput,
  ): Promise<LaunchDevcontainerResult> {
    try {
      const output = await runDevcontainerCli([
        "up",
        "--workspace-folder",
        input.workspacePath,
        "--config",
        path.join(input.workspacePath, input.devcontainerConfigPath),
        "--id-label",
        `boboddy.project-id=${input.projectId}`,
        "--id-label",
        `boboddy.project-runtime-session-id=${input.sessionId}`,
        "--id-label",
        `boboddy.requested-by-user-id=${input.requestedByUserId}`,
        "--log-format",
        "json",
      ]);
      const containerId = extractContainerId(output);

      if (!containerId) {
        throw new Error(
          `Devcontainer CLI did not return a containerId: ${output}`,
        );
      }

      return {
        containerId,
        metadata: {
          launchOutput: output.slice(-4_000),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to launch devcontainer: ${message}`);
    }
  }

  async stop(containerId: string): Promise<void> {
    try {
      await execFileAsync("docker", ["rm", "-f", containerId]);
    } catch {
      // Ignore missing or already-stopped containers.
    }
  }
}
