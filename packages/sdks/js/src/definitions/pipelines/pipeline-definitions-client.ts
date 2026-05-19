import type { SerializedAdvancementPolicy } from "../advancement-policies/define-advancement-policy";

type RequestOptions = {
  headers?: Record<string, unknown>;
};

export type PipelineStepCreateInput = {
  stepDefinitionId: string;
  stepDefinitionVersion: number;
  key: string;
  name: string;
  description: string | null;
  position: number;
  inputBindingsJson: Record<string, unknown>;
  timeoutSeconds: number | null;
  retryPolicyJson: null;
  advancementPolicyDefinition: SerializedAdvancementPolicy;
};

export type CreatePipelineInput = {
  projectId: string;
  key: string;
  name: string;
  description: string | null;
  version: number;
  status: "draft" | "active" | "archived";
  stepDefinitions: PipelineStepCreateInput[];
};

export type UpdatePipelineInput = {
  projectId: string;
  key: string;
  name: string;
  description: string | null;
  version: number;
  status: "draft" | "active" | "archived";
};

export type ExistingPipelineStep = {
  id: string;
  key: string;
};

export type ExistingPipeline = {
  id: string;
  key: string;
  version: number;
  status: string;
  steps: ExistingPipelineStep[];
};

export function createPipelineDefinitionsClient(
  baseUrl: string,
): ReturnType<typeof buildPipelineDefinitionsClient> {
  const base = baseUrl.replace(/\/$/, "");

  async function doFetch(
    path: string,
    method: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<unknown> {
    const requestHeaders: Record<string, string> = { ...headers };
    if (body !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
    }
    const response = await fetch(`${base}${path}`, {
      method,
      headers: requestHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => null)) as
        | { title?: string }
        | null;
      throw new Error(
        err?.title ?? `HTTP ${String(response.status)} ${method} ${path}`,
      );
    }
    return response.json().catch(() => null);
  }

  return buildPipelineDefinitionsClient(base, doFetch);
}

const buildPipelineDefinitionsClient = (
  _base: string,
  doFetch: (
    path: string,
    method: string,
    headers: Record<string, string>,
    body?: unknown,
  ) => Promise<unknown>,
) => ({
  listByProjectId: async (
    projectId: string,
    options?: RequestOptions,
  ): Promise<ExistingPipeline[]> => {
    const path = `/api/linear-pipeline-definitions?projectId=${encodeURIComponent(projectId)}`;
    const result = await doFetch(
      path,
      "GET",
      (options?.headers as Record<string, string>) ?? {},
    );
    return (result as ExistingPipeline[] | null) ?? [];
  },

  create: async (
    body: CreatePipelineInput,
    options?: RequestOptions,
  ): Promise<{ id: string; key: string }> => {
    const result = await doFetch(
      "/api/linear-pipeline-definitions",
      "POST",
      (options?.headers as Record<string, string>) ?? {},
      body,
    );
    return result as { id: string; key: string };
  },

  update: async (
    pipelineId: string,
    body: UpdatePipelineInput,
    options?: RequestOptions,
  ): Promise<void> => {
    await doFetch(
      `/api/linear-pipeline-definitions/${pipelineId}`,
      "PUT",
      (options?.headers as Record<string, string>) ?? {},
      body,
    );
  },

  addStep: async (
    pipelineId: string,
    body: PipelineStepCreateInput,
    options?: RequestOptions,
  ): Promise<void> => {
    await doFetch(
      `/api/linear-pipeline-definitions/${pipelineId}/steps`,
      "POST",
      (options?.headers as Record<string, string>) ?? {},
      body,
    );
  },

  removeStep: async (
    pipelineId: string,
    stepId: string,
    options?: RequestOptions,
  ): Promise<void> => {
    await doFetch(
      `/api/linear-pipeline-definitions/${pipelineId}/steps/${stepId}`,
      "DELETE",
      (options?.headers as Record<string, string>) ?? {},
    );
  },
});
