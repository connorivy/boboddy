import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseJsonc } from "../../../lib/jsonc";
import { projectConfigSchema } from "../contracts/project-config-contracts";
import type { ProjectConfig } from "../domain/project-config";

const BOBODDY_DIR = ".boboddy";
const CONFIG_FILENAME = "boboddy.jsonc";

function getConfigPath(rootDir: string): string {
  return path.join(rootDir, BOBODDY_DIR, CONFIG_FILENAME);
}

export async function loadProjectConfig(rootDir = process.cwd()): Promise<ProjectConfig | null> {
  try {
    const content = await readFile(getConfigPath(rootDir), "utf8");
    const parsed = projectConfigSchema.safeParse(parseJsonc(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveProjectConfig(projectId: string, rootDir = process.cwd()): Promise<void> {
  const configDir = path.join(rootDir, BOBODDY_DIR);
  await mkdir(configDir, { recursive: true });
  await writeFile(getConfigPath(rootDir), JSON.stringify({ projectId }, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function deriveProjectName(gitUrl: string): string {
  const lastSegment = gitUrl.split(/[/:]/u).pop() ?? gitUrl;
  return lastSegment.replace(/\.git$/u, "");
}
