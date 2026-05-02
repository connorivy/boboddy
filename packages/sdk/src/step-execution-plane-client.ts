import type { App } from "@boboddy/api/app";
import { createBoboddyTreaty, unwrapTreatyResponse } from "./treaty";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

type RequestOptions = {
  headers?: Record<string, unknown> | undefined;
};

export function createStepExecutionPlaneClient(
  baseUrl: string,
): ReturnType<typeof buildStepExecutionPlaneClient>;
export function createStepExecutionPlaneClient(
  app: App,
): ReturnType<typeof buildStepExecutionPlaneClient>;
export function createStepExecutionPlaneClient(baseUrlOrApp: string | App) {
  return buildStepExecutionPlaneClient(
    createBoboddyTreaty(baseUrlOrApp as never),
  );
}

const buildStepExecutionPlaneClient = (
  apiClient: ReturnType<typeof createBoboddyTreaty>,
) => {
  return {
    claimStepExecutions: async (
      body: {
        projectId: string;
        workerId: string;
        batchSize: number;
        leaseDurationSeconds: number;
      },
      options?: RequestOptions,
    ) =>
      await unwrapTreatyResponse(
        apiClient.api["step-executions"].claims.post(
          body as never,
          options as never,
        ),
      ),
    heartbeatStepExecution: async (
      stepExecutionId: string,
      body: {
        claimToken: string;
        leaseDurationSeconds: number;
      },
      options?: RequestOptions,
    ) =>
      await unwrapTreatyResponse(
        apiClient.api["step-executions"]({
          stepExecutionId: stepExecutionId,
        }).heartbeat.put(body, options as never),
      ),
    getStepExecution: async (
      stepExecutionId: string,
      options?: RequestOptions,
    ) =>
      await unwrapTreatyResponse(
        apiClient.api["step-executions"]({
          stepExecutionId: stepExecutionId,
        }).get(options as never),
      ),
    getStepExecutionWorkerContext: async (
      stepExecutionId: string,
      body: {
        claimToken: string;
      },
      options?: RequestOptions,
    ) =>
      await unwrapTreatyResponse(
        apiClient.api["step-executions"]({
          stepExecutionId: stepExecutionId,
        })["worker-context"].post(body as never, options as never),
      ),
    completeStepExecution: async (
      stepExecutionId: string,
      body: {
        claimToken: string;
        status: "succeeded" | "failed";
        resultJson: JsonValue;
        errorJson: JsonValue;
      },
      options?: RequestOptions,
    ) =>
      await unwrapTreatyResponse(
        apiClient.api["step-executions"]({
          stepExecutionId: stepExecutionId,
        }).completions.post(body as never, options as never),
      ),
    failStepExecution: async (
      stepExecutionId: string,
      body: {
        claimToken: string;
        resultJson: JsonValue;
        errorJson: JsonValue;
      },
      options?: RequestOptions,
    ) =>
      await unwrapTreatyResponse(
        apiClient.api["step-executions"]({
          stepExecutionId: stepExecutionId,
        }).completions.post(
          {
            ...body,
            status: "failed",
          } as never,
          options as never,
        ),
      ),
  };
};
