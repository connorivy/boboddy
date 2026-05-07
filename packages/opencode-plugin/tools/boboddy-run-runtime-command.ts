import { tool } from "@opencode-ai/plugin";
import {
  assertWorkspaceReadable,
  toRuntimeResponseJson,
  waitForRuntimeResponse,
  writeRuntimeRequest,
} from "./_shared/runtime-request";

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
    await assertWorkspaceReadable(process.cwd());
    const requestId = crypto.randomUUID();
    await writeRuntimeRequest({
      workspacePath: process.cwd(),
      request: {
        id: requestId,
        kind: "run_command",
        commandName: args.commandName,
      },
    });

    return toRuntimeResponseJson(
      await waitForRuntimeResponse({
        workspacePath: process.cwd(),
        requestId,
        timeoutMs: TIMEOUT_MS,
        pollIntervalMs: POLL_INTERVAL_MS,
        timeoutMessage:
          "Timed out waiting for Boboddy runtime command execution response from the local worker.",
      }),
    );
  },
});
