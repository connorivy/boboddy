import { tool } from "@opencode-ai/plugin";
import {
  assertWorkspaceReadable,
  toRuntimeResponseJson,
  waitForRuntimeResponse,
  writeRuntimeRequest,
} from "./_shared/runtime-request";

const POLL_INTERVAL_MS = 250;
const TIMEOUT_MS = 90_000;

export default tool({
  description:
    "Ensure a Boboddy runtime service defined in .boboddy/opencode.jsonc is started inside the user's devcontainer and return its access details.",
  args: {
    serviceName: tool.schema
      .string()
      .describe("Name of the configured service to start or reuse"),
  },
  async execute(args) {
    await assertWorkspaceReadable(process.cwd());
    const requestId = crypto.randomUUID();
    await writeRuntimeRequest({
      workspacePath: process.cwd(),
      request: {
        id: requestId,
        kind: "ensure_service",
        serviceName: args.serviceName,
      },
    });

    return toRuntimeResponseJson(
      await waitForRuntimeResponse({
        workspacePath: process.cwd(),
        requestId,
        timeoutMs: TIMEOUT_MS,
        pollIntervalMs: POLL_INTERVAL_MS,
        timeoutMessage:
          "Timed out waiting for Boboddy runtime service readiness response from the local worker.",
      }),
    );
  },
});
