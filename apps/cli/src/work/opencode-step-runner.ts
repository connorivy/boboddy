import { createOpencodeClient } from "@opencode-ai/sdk";
import type { StepExecutionAgentRunner } from "@boboddy/core/pipeline-executions/step-execution/application/process-project-work";
import { logWork } from "./work-logger";

export type PromptAsyncOpencodeStepInput = {
  aiBaseUrl: string;
  sessionTitle: string;
  promptText: string;
};

export type PromptAsyncOpencodeStepResult = {
  sessionId: string;
};

export type OpencodeStepRunner = StepExecutionAgentRunner;

const DEFAULT_DIRECTORY = "/workspace";

export class DefaultOpencodeStepRunner implements OpencodeStepRunner {
  async promptAsync(
    input: PromptAsyncOpencodeStepInput,
  ): Promise<PromptAsyncOpencodeStepResult> {
    logWork("opencode", "Creating OpenCode client", {
      aiBaseUrl: input.aiBaseUrl,
      sessionTitle: input.sessionTitle,
    });
    const client = createOpencodeClient({
      baseUrl: input.aiBaseUrl,
      directory: DEFAULT_DIRECTORY,
    });
    const sessionResponse = await client.session.create({
      body: {
        title: input.sessionTitle,
      },
    });
    const sessionId = sessionResponse.data?.id;

    if (!sessionId) {
      throw new Error("OpenCode did not return a session id");
    }

    logWork("opencode", "Created OpenCode session", {
      sessionId,
      sessionTitle: input.sessionTitle,
    });

    await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [
          {
            type: "text",
            text: input.promptText,
          },
        ],
      },
    });
    logWork("opencode", "Submitted prompt to OpenCode session", {
      sessionId,
      promptLength: input.promptText.length,
    });
    return {
      sessionId,
    };
  }
}
