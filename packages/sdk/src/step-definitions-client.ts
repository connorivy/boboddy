import { createClient } from "./generated/client";
import { StepDefinitions } from "./generated/sdk.gen";
import type {
  PostApiStepDefinitionsData,
  PutApiStepDefinitionsByStepDefinitionIdData,
} from "./generated/types.gen";

type RequestOptions = {
  headers?: Record<string, unknown> | undefined;
};

export type CreateStepDefinitionInput = PostApiStepDefinitionsData["body"];
export type UpdateStepDefinitionInput =
  PutApiStepDefinitionsByStepDefinitionIdData["body"];

export function createStepDefinitionsClient(
  baseUrl: string,
): ReturnType<typeof buildStepDefinitionsClient> {
  const client = createClient({ baseUrl });
  return buildStepDefinitionsClient(new StepDefinitions({ client }));
}

const buildStepDefinitionsClient = (stepDefinitions: StepDefinitions) => {
  return {
    listByProjectId: async (projectId: string, options?: RequestOptions) => {
      const result = await stepDefinitions.listStepDefinitions({
        query: { projectId },
        headers: options?.headers,
      });
      if (result.error) throw new Error(JSON.stringify(result.error));
      return result.data;
    },
    create: async (
      body: CreateStepDefinitionInput,
      options?: RequestOptions,
    ) => {
      const result = await stepDefinitions.createStepDefinition({
        body,
        headers: options?.headers,
      });
      if (result.error) throw new Error(JSON.stringify(result.error));
      return result.data;
    },
    update: async (
      stepDefinitionId: string,
      body: UpdateStepDefinitionInput,
      options?: RequestOptions,
    ) => {
      const result = await stepDefinitions.updateStepDefinition({
        path: { stepDefinitionId },
        body,
        headers: options?.headers,
      });
      if (result.error) throw new Error(JSON.stringify(result.error));
      return result.data;
    },
  };
};
