import { loadProjectConfig } from "../infra/fs-project-config-repo";

export async function readProjectConfig(rootDir = process.cwd()) {
  return loadProjectConfig(rootDir);
}
