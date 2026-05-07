import { tool } from "@opencode-ai/plugin";
import {
  assertWorkspaceReadable,
  toRuntimeResponseJson,
  waitForRuntimeResponse,
  writeRuntimeRequest,
} from "./_shared/runtime-request";

const POLL_INTERVAL_MS = 250;
const TIMEOUT_MS = 10_000;

export default tool({
  description:
    "Cancel a running command that was started with boboddy-run-command. Use the commandId from the boboddy-run-command response.",
  args: {
    commandId: tool.schema
      .string()
      .describe("The commandId returned in the boboddy-run-command response"),
  },
  async execute(args) {
    await assertWorkspaceReadable(process.cwd());
    const requestId = crypto.randomUUID();
    await writeRuntimeRequest({
      workspacePath: process.cwd(),
      request: {
        id: requestId,
        kind: "cancel_command",
        targetId: args.commandId,
      },
    });

    return toRuntimeResponseJson(
      await waitForRuntimeResponse({
        workspacePath: process.cwd(),
        requestId,
        timeoutMs: TIMEOUT_MS,
        pollIntervalMs: POLL_INTERVAL_MS,
        timeoutMessage:
          "Timed out waiting for Boboddy cancel command response from the local worker.",
      }),
    );
  },
});
