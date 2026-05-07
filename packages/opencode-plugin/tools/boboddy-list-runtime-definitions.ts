import { tool } from "@opencode-ai/plugin";
import { parseBoboddyConfig } from "./_shared/boboddy-config-parser";

export default tool({
  description:
    "List Boboddy project runtime commands and services from .boboddy/boboddy.jsonc when available.",
  args: {},
  async execute() {
    const result = await parseBoboddyConfig(process.cwd());

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
