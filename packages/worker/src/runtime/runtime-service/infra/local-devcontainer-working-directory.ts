import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDevcontainerWorkspaceFolderFromContent } from "./local-devcontainer-jsonc";

export const resolveDevcontainerWorkingDirectory = async (input: {
  workspacePath: string;
  devcontainerConfigPath: string;
  cwd: string | null;
}): Promise<string | null> => {
  if (!input.cwd) {
    return null;
  }

  const configContent = await readFile(
    path.join(input.workspacePath, input.devcontainerConfigPath),
    "utf8",
  );
  const workspaceFolder = parseDevcontainerWorkspaceFolderFromContent(
    configContent,
    input.workspacePath,
  );

  if (!workspaceFolder) {
    return null;
  }

  let relativeCwd: string;
  if (path.isAbsolute(input.cwd)) {
    relativeCwd = path.relative(input.workspacePath, input.cwd);
    if (relativeCwd.startsWith("..")) {
      return null;
    }
  } else {
    relativeCwd = input.cwd;
  }
  return path.posix.join(workspaceFolder, relativeCwd);
};
