import { createStepExecutionPlaneClient } from "@boboddy/sdk";
import { parseUuidV7 } from "@boboddy/core/common/contracts/uuid-v7";
import type {
  StepExecutionWorkerClient,
} from "@boboddy/core/pipeline-executions/step-execution/application/process-project-work";
import type { StepExecutionWorkerContextContract } from "@boboddy/core/pipeline-executions/step-execution/contracts/step-execution-contracts";
import { loadAuthenticatedSession } from "../auth/session";

export type StepExecutionWorkerContext = StepExecutionWorkerContextContract;

export type StepExecutionPlaneWorkerClient = StepExecutionWorkerClient;

function buildAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function createStepExecutionPlaneWorkerClient(baseUrl: string) {
  const authenticated = await loadAuthenticatedSession(baseUrl);

  if (!authenticated) {
    throw new Error(`Not signed in to ${baseUrl}.`);
  }

  const planeClient = createStepExecutionPlaneClient(baseUrl);
  const headers = buildAuthHeaders(authenticated.profile.accessToken);

  return {
    userId: parseUuidV7(authenticated.session.user.id),
    claimStepExecutions: async (input: {
      projectId: string;
      workerId: string;
      batchSize: number;
      leaseDurationSeconds: number;
    }) => await planeClient.claimStepExecutions(input, { headers }),
    heartbeatStepExecution: async (input: {
      stepExecutionId: string;
      claimToken: string;
      leaseDurationSeconds: number;
    }) => {
      await planeClient.heartbeatStepExecution(
        input.stepExecutionId,
        {
          claimToken: input.claimToken,
          leaseDurationSeconds: input.leaseDurationSeconds,
        },
        { headers },
      );
    },
    failStepExecution: async (input: {
      stepExecutionId: string;
      claimToken: string;
      resultJson: unknown;
      errorJson: unknown;
    }) => {
      await planeClient.failStepExecution(
        input.stepExecutionId,
        {
          claimToken: input.claimToken,
          resultJson: input.resultJson as never,
          errorJson: input.errorJson as never,
        },
        { headers },
      );
    },
    completeStepExecution: async (input: {
      stepExecutionId: string;
      claimToken: string;
      resultJson: unknown;
      errorJson: unknown;
    }) => {
      await planeClient.completeStepExecution(
        input.stepExecutionId,
        {
          claimToken: input.claimToken,
          status: "succeeded",
          resultJson: input.resultJson as never,
          errorJson: input.errorJson as never,
        },
        { headers },
      );
    },
    getStepExecution: async (input: { stepExecutionId: string }) =>
      await planeClient.getStepExecution(input.stepExecutionId, { headers }),
    getStepExecutionWorkerContext: async (input: {
      stepExecutionId: string;
      claimToken: string;
    }) =>
      await planeClient.getStepExecutionWorkerContext(
        input.stepExecutionId,
        {
          claimToken: input.claimToken,
        },
        { headers },
      ),
  } satisfies StepExecutionPlaneWorkerClient;
}
