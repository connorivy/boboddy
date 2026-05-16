import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseJsonc } from "../lib/jsonc";

const BOBODDY_DIR = ".boboddy";
const CONFIG_FILENAME = "boboddy.jsonc";

export interface ProjectConfig {
  projectId: string;
}

function getConfigPath(rootDir: string): string {
  return path.join(rootDir, BOBODDY_DIR, CONFIG_FILENAME);
}

export async function readProjectConfig(rootDir = process.cwd()): Promise<ProjectConfig | null> {
  try {
    const content = await readFile(getConfigPath(rootDir), "utf8");
    const parsed = parseJsonc(content);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "projectId" in parsed &&
      typeof (parsed as Record<string, unknown>)["projectId"] === "string"
    ) {
      return { projectId: (parsed as Record<string, unknown>)["projectId"] as string };
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeProjectConfig(projectId: string, rootDir = process.cwd()): Promise<void> {
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
