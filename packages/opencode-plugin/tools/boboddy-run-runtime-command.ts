import { tool } from "@opencode-ai/plugin";
import {
  assertWorkspaceReadable,
  toRuntimeResponseJson,
  waitForRuntimeResponse,
  writeRuntimeRequest,
} from "./_shared/runtime-request";
import { getWorkspaceRoot } from "./_shared/workspace";

const POLL_INTERVAL_MS = 250;
const TIMEOUT_MS = 60_000;

export default tool({
  description:
    "Run a Boboddy runtime command defined in .boboddy/boboddy.jsonc inside the user's devcontainer.",
  args: {
    commandName: tool.schema
      .string()
      .describe(
        "Name of the configured command to run. Commands can be found using the boboddy-list-runtime-definitions tool.",
      ),
  },
  async execute(args) {
    const workspacePath = getWorkspaceRoot(import.meta.url);
    await assertWorkspaceReadable(workspacePath);
    const requestId = crypto.randomUUID();
    await writeRuntimeRequest({
      workspacePath,
      request: {
        id: requestId,
        kind: "run_command",
        commandName: args.commandName,
      },
    });

    return toRuntimeResponseJson(
      await waitForRuntimeResponse({
        workspacePath,
        requestId,
        timeoutMs: TIMEOUT_MS,
        pollIntervalMs: POLL_INTERVAL_MS,
        timeoutMessage:
          "Timed out waiting for Boboddy runtime command execution response from the local worker.",
      }),
    );
  },
});
