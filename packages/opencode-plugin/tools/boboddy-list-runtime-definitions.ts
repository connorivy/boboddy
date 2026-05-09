import { tool } from "@opencode-ai/plugin";
import { parseBoboddyConfig } from "./_shared/boboddy-config-parser";
import { getWorkspaceRoot } from "./_shared/workspace";

export default tool({
  description:
    "List Boboddy project runtime commands and services from .boboddy/boboddy.jsonc when available.",
  args: {},
  async execute() {
    const result = await parseBoboddyConfig(getWorkspaceRoot(import.meta.url));

    if (!result.found) {
      return JSON.stringify(
        {
          ok: false,
          error: "No .boboddy/boboddy.jsonc found in workspace",
          data: null,
        },
        null,
        2,
      );
    }

    return JSON.stringify(
      { ok: true, error: null, data: result.config },
      null,
      2,
    );
  },
});
