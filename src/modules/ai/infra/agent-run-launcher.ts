import type { StepExecutionStepName } from "@/modules/step-executions/domain/step-execution.types";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import {
  sandboxAgentRunRequestSchema,
  sandboxAgentRunResponseSchema,
  type SandboxAgentRunRequest,
  type SandboxWebhookTarget,
} from "@/modules/ai/contracts/sandbox-agent-run-contracts";
import { GithubApiService } from "@/modules/step-executions/infra/github-copilot-coding-agent";

export type LaunchAgentRunInput = {
  stepExecutionId: string;
  stepName: StepExecutionStepName;
  ticketId: string;
  pipelineId: string | null;
  issueNumber: number;
  baseBranch: string;
  customInstructions: string;
  customAgent?: string;
};

export type LaunchAgentRunOutput = {
  externalRunId?: string;
};

export interface AgentRunLauncher {
  launch(input: LaunchAgentRunInput): Promise<LaunchAgentRunOutput>;
}

export class GithubCopilotAgentRunLauncher implements AgentRunLauncher {
  constructor(private readonly githubService: GithubApiService) {}

  async launch(input: LaunchAgentRunInput): Promise<LaunchAgentRunOutput> {
    await this.githubService.assignCopilot({
      issueNumber: input.issueNumber,
      baseBranch: input.baseBranch,
      customInstructions: input.customInstructions,
      customAgent: input.customAgent,
    });

    return {};
  }
}

const getRequiredEnv = (
  name:
    | "SANDBOX_AGENT_BASE_URL"
    | "SANDBOX_AGENT_REPOSITORY"
    | "APP_BASE_URL"
    | "BOBODDY_API_KEY",
): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
};

function buildSandboxCallbackTarget(
  stepName: StepExecutionStepName,
  stepExecutionId: string,
): SandboxWebhookTarget {
  const appBaseUrl = getRequiredEnv("APP_BASE_URL");
  const apiKey = getRequiredEnv("BOBODDY_API_KEY");

  const pathname =
    stepName === TICKET_INVESTIGATION_STEP_NAME
      ? "/api/webhooks/ticket-investigation-step-output"
      : stepName === FAILING_TEST_REPRO_STEP_NAME
        ? "/api/webhooks/failing-test-repro-step-output"
        : stepName === FAILING_TEST_FIX_STEP_NAME
          ? "/api/webhooks/failing-test-fix-step-output"
          : null;

  if (!pathname) {
    throw new Error(`Sandbox launch is not supported for step "${stepName}"`);
  }

  return {
    url: new URL(pathname, appBaseUrl).toString(),
    method: "PUT",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
    },
    query: {
      stepExecutionId,
    },
  };
}

export class SandboxAgentRunLauncher implements AgentRunLauncher {
  private readonly baseUrl = getRequiredEnv("SANDBOX_AGENT_BASE_URL");
  private readonly repository = getRequiredEnv("SANDBOX_AGENT_REPOSITORY");
  private readonly token = process.env.SANDBOX_AGENT_TOKEN?.trim();

  async launch(input: LaunchAgentRunInput): Promise<LaunchAgentRunOutput> {
    const requestPayload: SandboxAgentRunRequest =
      sandboxAgentRunRequestSchema.parse({
        repository: this.repository,
        stepExecutionId: input.stepExecutionId,
        stepName: input.stepName,
        ticketId: input.ticketId,
        pipelineId: input.pipelineId,
        issueNumber: input.issueNumber,
        baseBranch: input.baseBranch,
        customInstructions: input.customInstructions,
        customAgent: input.customAgent,
        callback: buildSandboxCallbackTarget(
          input.stepName,
          input.stepExecutionId,
        ),
      });

    const response = await fetch(`${this.baseUrl}/agent-runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `Sandbox agent launch failed with ${response.status}: ${responseText}`,
      );
    }

    const payload = sandboxAgentRunResponseSchema.parse(await response.json());

    return {
      externalRunId: payload.runId ?? undefined,
    };
  }
}

export function createAgentRunLauncher(
  githubService: GithubApiService,
): AgentRunLauncher {
  const provider = process.env.AI_AGENT_PROVIDER?.trim().toLowerCase();

  if (provider === "sandbox") {
    return new SandboxAgentRunLauncher();
  }

  return new GithubCopilotAgentRunLauncher(githubService);
}
