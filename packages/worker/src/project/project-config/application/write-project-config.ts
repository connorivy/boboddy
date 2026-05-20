import { saveProjectConfig } from "../infra/fs-project-config-repo";

export async function writeProjectConfig(projectId: string, rootDir = process.cwd()) {
  await saveProjectConfig(projectId, rootDir);
}
