import { describe, expect, test } from "bun:test";
import { createPipelineDefinitionsClient } from "../src/definitions/pipelines/pipeline-definitions-client";

type CapturedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
};

type MockResponse = { status: number; body: unknown };

function createMockFetch(responses: MockResponse[]): {
  mockFetch: typeof globalThis.fetch;
  captured: CapturedRequest[];
} {
  let callIndex = 0;
  const captured: CapturedRequest[] = [];

  const mockFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const urlStr =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : input;
    const rawBody = init?.body;
    const parsedBody =
      typeof rawBody === "string" && rawBody.length > 0
        ? (JSON.parse(rawBody) as unknown)
        : undefined;

    captured.push({
      url: urlStr,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(
        Object.entries(
          (init?.headers as Record<string, string> | undefined) ?? {},
        ),
      ),
      body: parsedBody,
    });

    const resp = responses[callIndex++] ?? { status: 200, body: null };
    const bodyStr =
      resp.body !== null && resp.body !== undefined
        ? JSON.stringify(resp.body)
        : "";
    return new Response(bodyStr, { status: resp.status });
  };

  return { mockFetch: mockFetch as typeof globalThis.fetch, captured };
}

const AUTH_HEADER = { Authorization: "Bearer test-token" };
const BASE_URL = "https://boboddy.example.com";

describe("createPipelineDefinitionsClient", () => {
  describe("listByProjectId", () => {
    test("sends GET to /api/linear-pipeline-definitions with projectId query param", async () => {
      const { mockFetch, captured } = createMockFetch([
        { status: 200, body: [] },
      ]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        await client.listByProjectId("proj-123", { headers: AUTH_HEADER });

        expect(captured).toHaveLength(1);
        expect(captured[0]?.method).toBe("GET");
        expect(captured[0]?.url).toBe(
          `${BASE_URL}/api/linear-pipeline-definitions?projectId=proj-123`,
        );
        expect(captured[0]?.headers["Authorization"]).toBe("Bearer test-token");
      } finally {
        globalThis.fetch = prev;
      }
    });

    test("returns the parsed array from the response body", async () => {
      const pipelines = [
        { id: "pl-1", key: "investigation", version: 1, status: "active", steps: [] },
        { id: "pl-2", key: "triage", version: 1, status: "draft", steps: [] },
      ];
      const { mockFetch } = createMockFetch([{ status: 200, body: pipelines }]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        const result = await client.listByProjectId("proj-123", { headers: AUTH_HEADER });

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ id: "pl-1", key: "investigation" });
        expect(result[1]).toMatchObject({ id: "pl-2", key: "triage" });
      } finally {
        globalThis.fetch = prev;
      }
    });

    test("returns empty array when response body is null", async () => {
      const { mockFetch } = createMockFetch([{ status: 200, body: null }]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        const result = await client.listByProjectId("proj-123", { headers: AUTH_HEADER });
        expect(result).toEqual([]);
      } finally {
        globalThis.fetch = prev;
      }
    });
  });

  describe("create", () => {
    test("sends POST to /api/linear-pipeline-definitions with the full body", async () => {
      const newPipeline = { id: "pl-new", key: "investigation" };
      const { mockFetch, captured } = createMockFetch([
        { status: 200, body: newPipeline },
      ]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        await client.create(
          {
            projectId: "proj-123",
            key: "investigation",
            name: "Investigation",
            description: null,
            version: 1,
            status: "active",
            stepDefinitions: [],
          },
          { headers: AUTH_HEADER },
        );

        expect(captured).toHaveLength(1);
        expect(captured[0]?.method).toBe("POST");
        expect(captured[0]?.url).toBe(
          `${BASE_URL}/api/linear-pipeline-definitions`,
        );
        expect(captured[0]?.headers["Content-Type"]).toBe("application/json");
        expect(captured[0]?.headers["Authorization"]).toBe("Bearer test-token");
        expect(captured[0]?.body).toMatchObject({
          projectId: "proj-123",
          key: "investigation",
          name: "Investigation",
          status: "active",
          stepDefinitions: [],
        });
      } finally {
        globalThis.fetch = prev;
      }
    });

    test("sends stepDefinitions with all required fields", async () => {
      const { mockFetch, captured } = createMockFetch([
        { status: 200, body: { id: "pl-1", key: "test" } },
      ]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        await client.create(
          {
            projectId: "proj-123",
            key: "test",
            name: "Test",
            description: "desc",
            version: 2,
            status: "draft",
            stepDefinitions: [
              {
                stepDefinitionId: "sd-abc",
                stepDefinitionVersion: 3,
                key: "evaluate",
                name: "Evaluate",
                description: null,
                position: 1,
                inputBindingsJson: { content: { source: "pipeline_input", path: "body" } },
                timeoutSeconds: 300,
                retryPolicyJson: null,
                advancementPolicyDefinition: {
                  rulesJson: { rules: [] },
                  defaultEventType: "continue",
                  defaultEventParamsJson: null,
                  allowedEventTypes: ["continue"],
                },
              },
            ],
          },
          { headers: AUTH_HEADER },
        );

        const body = captured[0]?.body as Record<string, unknown>;
        const steps = body["stepDefinitions"] as unknown[];
        expect(steps).toHaveLength(1);
        expect(steps[0]).toMatchObject({
          stepDefinitionId: "sd-abc",
          stepDefinitionVersion: 3,
          key: "evaluate",
          position: 1,
          timeoutSeconds: 300,
        });
      } finally {
        globalThis.fetch = prev;
      }
    });

    test("returns the created pipeline object from the response", async () => {
      const { mockFetch } = createMockFetch([
        { status: 200, body: { id: "pl-xyz", key: "investigation" } },
      ]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        const result = await client.create(
          {
            projectId: "p",
            key: "investigation",
            name: "Investigation",
            description: null,
            version: 1,
            status: "active",
            stepDefinitions: [],
          },
          { headers: AUTH_HEADER },
        );
        expect(result).toMatchObject({ id: "pl-xyz", key: "investigation" });
      } finally {
        globalThis.fetch = prev;
      }
    });
  });

  describe("update", () => {
    test("sends PUT to /api/linear-pipeline-definitions/{id} with header fields", async () => {
      const { mockFetch, captured } = createMockFetch([{ status: 200, body: null }]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        await client.update(
          "pl-existing",
          {
            projectId: "proj-123",
            key: "investigation",
            name: "Investigation Updated",
            description: "Updated description",
            version: 1,
            status: "active",
          },
          { headers: AUTH_HEADER },
        );

        expect(captured).toHaveLength(1);
        expect(captured[0]?.method).toBe("PUT");
        expect(captured[0]?.url).toBe(
          `${BASE_URL}/api/linear-pipeline-definitions/pl-existing`,
        );
        expect(captured[0]?.body).toMatchObject({
          projectId: "proj-123",
          key: "investigation",
          name: "Investigation Updated",
          description: "Updated description",
          version: 1,
          status: "active",
        });
      } finally {
        globalThis.fetch = prev;
      }
    });
  });

  describe("addStep", () => {
    test("sends POST to /api/linear-pipeline-definitions/{id}/steps", async () => {
      const { mockFetch, captured } = createMockFetch([{ status: 200, body: null }]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        await client.addStep(
          "pl-abc",
          {
            stepDefinitionId: "sd-1",
            stepDefinitionVersion: 1,
            key: "evaluate",
            name: "Evaluate",
            description: null,
            position: 1,
            inputBindingsJson: {},
            timeoutSeconds: null,
            retryPolicyJson: null,
            advancementPolicyDefinition: {
              rulesJson: { rules: [] },
              defaultEventType: "continue",
              defaultEventParamsJson: null,
              allowedEventTypes: ["continue"],
            },
          },
          { headers: AUTH_HEADER },
        );

        expect(captured).toHaveLength(1);
        expect(captured[0]?.method).toBe("POST");
        expect(captured[0]?.url).toBe(
          `${BASE_URL}/api/linear-pipeline-definitions/pl-abc/steps`,
        );
        expect(captured[0]?.body).toMatchObject({
          stepDefinitionId: "sd-1",
          key: "evaluate",
          position: 1,
        });
      } finally {
        globalThis.fetch = prev;
      }
    });
  });

  describe("removeStep", () => {
    test("sends DELETE to /api/linear-pipeline-definitions/{id}/steps/{stepId}", async () => {
      const { mockFetch, captured } = createMockFetch([{ status: 200, body: null }]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        await client.removeStep("pl-abc", "step-99", { headers: AUTH_HEADER });

        expect(captured).toHaveLength(1);
        expect(captured[0]?.method).toBe("DELETE");
        expect(captured[0]?.url).toBe(
          `${BASE_URL}/api/linear-pipeline-definitions/pl-abc/steps/step-99`,
        );
      } finally {
        globalThis.fetch = prev;
      }
    });

    test("does not send a request body on DELETE", async () => {
      const { mockFetch, captured } = createMockFetch([{ status: 200, body: null }]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        await client.removeStep("pl-abc", "step-99", { headers: AUTH_HEADER });

        expect(captured[0]?.body).toBeUndefined();
      } finally {
        globalThis.fetch = prev;
      }
    });
  });

  describe("error handling", () => {
    test("throws using server error title when the API returns a non-ok status", async () => {
      const { mockFetch } = createMockFetch([
        { status: 422, body: { title: "Pipeline key already exists", status: 422 } },
      ]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        let threw = false;
        try {
          await client.listByProjectId("proj-123", { headers: AUTH_HEADER });
        } catch (err) {
          threw = true;
          expect((err as Error).message).toBe("Pipeline key already exists");
        }
        expect(threw).toBe(true);
      } finally {
        globalThis.fetch = prev;
      }
    });

    test("throws with HTTP status fallback when error body has no title", async () => {
      const { mockFetch } = createMockFetch([
        { status: 500, body: { detail: "internal error" } },
      ]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        let threw = false;
        try {
          await client.create(
            { projectId: "p", key: "k", name: "n", description: null, version: 1, status: "active", stepDefinitions: [] },
            { headers: AUTH_HEADER },
          );
        } catch (err) {
          threw = true;
          expect((err as Error).message).toContain("500");
        }
        expect(threw).toBe(true);
      } finally {
        globalThis.fetch = prev;
      }
    });

    test("throws with HTTP status fallback when the error body is not JSON", async () => {
      const prev = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response("Not Found", { status: 404 })) as unknown as typeof globalThis.fetch;
      try {
        const client = createPipelineDefinitionsClient(BASE_URL);
        let threw = false;
        try {
          await client.removeStep("pl-1", "step-1", { headers: AUTH_HEADER });
        } catch (err) {
          threw = true;
          expect((err as Error).message).toContain("404");
        }
        expect(threw).toBe(true);
      } finally {
        globalThis.fetch = prev;
      }
    });
  });

  describe("base URL normalization", () => {
    test("strips a trailing slash from the base URL", async () => {
      const { mockFetch, captured } = createMockFetch([{ status: 200, body: [] }]);
      const prev = globalThis.fetch;
      globalThis.fetch = mockFetch;
      try {
        const client = createPipelineDefinitionsClient("https://boboddy.example.com/");
        await client.listByProjectId("proj-1", { headers: AUTH_HEADER });
        expect(captured[0]?.url).not.toContain("//api");
      } finally {
        globalThis.fetch = prev;
      }
    });
  });
});
