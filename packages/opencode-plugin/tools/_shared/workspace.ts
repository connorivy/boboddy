import { fileURLToPath } from "node:url";
import path from "node:path";

// Tools are deployed to <workspaceRoot>/.opencode/tools/<tool>.ts
// Two levels up from the tool file's directory gives the workspace root.
export function getWorkspaceRoot(importMetaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "../..");
}
