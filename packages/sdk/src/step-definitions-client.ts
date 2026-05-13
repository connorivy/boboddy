import type { App } from "@boboddy/api/app";
import type {
  CreateStepDefinitionInput,
  UpdateStepDefinitionInput,
} from "@boboddy/core/pipeline-definitions/step-definition/contracts/step-definition-contracts";
import { createBoboddyTreaty, unwrapTreatyResponse } from "./treaty";

type RequestOptions = {
  headers?: Record<string, unknown> | undefined;
};

export function createStepDefinitionsClient(
  baseUrlOrApp: string | App,
): ReturnType<typeof buildStepDefinitionsClient> {
  return buildStepDefinitionsClient(createBoboddyTreaty(baseUrlOrApp));
}

const buildStepDefinitionsClient = (
  apiClient: ReturnType<typeof createBoboddyTreaty>,
) => {
  return {
    listByProjectId: async (projectId: string, options?: RequestOptions) =>
      await unwrapTreatyResponse(
        apiClient.api["step-definitions"].get({
          query: { projectId },
          headers: options?.headers,
        } as never),
      ),
    create: async (body: CreateStepDefinitionInput, options?: RequestOptions) =>
      await unwrapTreatyResponse(
        apiClient.api["step-definitions"].post(body as never, options as never),
      ),
    update: async (
      stepDefinitionId: string,
      body: UpdateStepDefinitionInput,
      options?: RequestOptions,
    ) =>
      await unwrapTreatyResponse(
        apiClient.api["step-definitions"]({ stepDefinitionId }).put(
          body as never,
          options as never,
        ),
      ),
  };
};
