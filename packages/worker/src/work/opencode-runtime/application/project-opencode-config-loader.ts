import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { AnyJsonObject } from "../../../common/contracts/json";
import { ConfigurationError } from "../../../lib/errors";
import { parseJsonc } from "../../../lib/jsonc";
import {
  PROJECT_OPENCODE_CONFIG_RELATIVE_PATH,
  ProjectOpencodeConfig,
} from "../domain/project-opencode-config";

export type LoadProjectOpencodeConfigResult = {
  config: ProjectOpencodeConfig | null;
  filePath: string;
};

export const getProjectOpencodeConfigPath = (workspacePath: string): string =>
  path.join(workspacePath, PROJECT_OPENCODE_CONFIG_RELATIVE_PATH);

export const loadProjectOpencodeConfig = async (
  workspacePath: string,
): Promise<LoadProjectOpencodeConfigResult> => {
  const filePath = getProjectOpencodeConfigPath(workspacePath);
  const exists = await access(filePath)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    return {
      config: null,
      filePath,
    };
  }

  let parsed: AnyJsonObject;
  try {
    parsed = parseJsonc(await readFile(filePath, "utf8")) as AnyJsonObject;
  } catch (error) {
    throw new ConfigurationError(
      `Invalid project OpenCode config at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      "PROJECT_OPENCODE_CONFIG_PARSE_FAILED",
    );
  }

  return {
    config: ProjectOpencodeConfig.create({
      $schema:
        typeof parsed["$schema"] === "string" ? parsed["$schema"] : null,
      version: parsed["version"] as number,
      commands: (parsed["commands"] as Record<string, AnyJsonObject> | null | undefined) ?? null,
      services: (parsed["services"] as Record<string, AnyJsonObject> | null | undefined) ?? null,
    }),
    filePath,
  };
};
