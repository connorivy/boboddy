import { describe, expect, test, vi } from "bun:test";
import { pushPipelineDefinitions } from "../../../../src/pipelines/pipeline-definitions/application/push-pipeline-definitions";
import type { PipelineDefinitionSpec } from "@boboddy/sdk/definitions/pipelines";

function makeLogger() {
  return { info: vi.fn() };
}

function makeUpsert() {
  return vi.fn(() => Promise.resolve({}));
}

function makeClient(upsert = makeUpsert()) {
  return vi.fn(() => ({ upsertPipelineDefinition: upsert }));
}

const ADVANCEMENT_POLICY = {
  rulesJson: { rules: [] },
  defaultEventType: "continue" as const,
  defaultEventParamsJson: null,
  allowedEventTypes: ["continue" as const],
};

function makeSpec(overrides?: Partial<PipelineDefinitionSpec>): PipelineDefinitionSpec {
  return {
    key: "my-pipeline",
    name: "My Pipeline",
    description: null,
    version: 1,
    status: "active",
    steps: [
      {
        stepKey: "step-a",
        stepName: "Step A",
        stepDescription: null,
        position: 0,
        inputBindingsJson: {},
        timeoutSeconds: null,
        advancementPolicyDefinition: ADVANCEMENT_POLICY,
        computedSignalDefinitions: [],
      },
    ],
    ...overrides,
  };
}

describe("pushPipelineDefinitions", () => {
  test("calls upsertPipelineDefinition for each spec with the resolved step def ID", async () => {
    const upsert = makeUpsert();
    const createClient = makeClient(upsert);

    await pushPipelineDefinitions({
      projectId: "proj-1",
      baseUrl: "https://example.com",
      headers: { Authorization: "Bearer token" },
      logger: makeLogger(),
      specs: [makeSpec()],
      stepDefs: [{ id: "step-def-id", key: "step-a", version: 1 }],
      createClient,
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      body: expect.objectContaining({
        projectId: "proj-1",
        key: "my-pipeline",
        name: "My Pipeline",
        version: 1,
        status: "active",
        stepDefinitions: [
          expect.objectContaining({
            stepDefinitionId: "step-def-id",
            stepDefinitionVersion: 1,
            key: "step-a",
          }),
        ],
      }),
      headers: { Authorization: "Bearer token" },
    });
  });

  test("calls upsertPipelineDefinition once per spec", async () => {
    const upsert = makeUpsert();
    const createClient = makeClient(upsert);

    const specs = [
      makeSpec({ key: "pipeline-a" }),
      makeSpec({ key: "pipeline-b" }),
    ];

    await pushPipelineDefinitions({
      projectId: "proj-1",
      baseUrl: "https://example.com",
      headers: { Authorization: "Bearer token" },
      logger: makeLogger(),
      specs,
      stepDefs: [{ id: "step-def-id", key: "step-a", version: 1 }],
      createClient,
    });

    expect(upsert).toHaveBeenCalledTimes(2);
  });

  test("resolves to the latest step def version when multiple versions exist", async () => {
    const upsert = makeUpsert();
    const createClient = makeClient(upsert);

    await pushPipelineDefinitions({
      projectId: "proj-1",
      baseUrl: "https://example.com",
      headers: { Authorization: "Bearer token" },
      logger: makeLogger(),
      specs: [makeSpec()],
      stepDefs: [
        { id: "old-id", key: "step-a", version: 1 },
        { id: "new-id", key: "step-a", version: 2 },
      ],
      createClient,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          stepDefinitions: [expect.objectContaining({ stepDefinitionId: "new-id", stepDefinitionVersion: 2 })],
        }),
      }),
    );
  });

  test("throws a descriptive error when a step key is missing from the server", async () => {
    let caughtError: unknown;
    try {
      await pushPipelineDefinitions({
        projectId: "proj-1",
        baseUrl: "https://example.com",
        headers: { Authorization: "Bearer token" },
        logger: makeLogger(),
        specs: [makeSpec()],
        stepDefs: [],
        createClient: makeClient(),
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toContain(
      'Step "step-a" referenced in pipeline "my-pipeline" was not found on the server',
    );
  });

  test("returns the count of pushed pipeline definitions", async () => {
    const specs = [makeSpec({ key: "p-1" }), makeSpec({ key: "p-2" })];

    const result = await pushPipelineDefinitions({
      projectId: "proj-1",
      baseUrl: "https://example.com",
      headers: { Authorization: "Bearer token" },
      logger: makeLogger(),
      specs,
      stepDefs: [{ id: "step-def-id", key: "step-a", version: 1 }],
      createClient: makeClient(),
    });

    expect(result).toEqual({ pushed: 2 });
  });

  test("returns zero pushed when specs list is empty", async () => {
    const result = await pushPipelineDefinitions({
      projectId: "proj-1",
      baseUrl: "https://example.com",
      headers: { Authorization: "Bearer token" },
      logger: makeLogger(),
      specs: [],
      stepDefs: [],
      createClient: makeClient(),
    });

    expect(result).toEqual({ pushed: 0 });
  });

  test("instantiates the client with the given baseUrl", async () => {
    const createClient = makeClient();

    await pushPipelineDefinitions({
      projectId: "proj-1",
      baseUrl: "https://my-server.example.com",
      headers: { Authorization: "Bearer token" },
      logger: makeLogger(),
      specs: [makeSpec()],
      stepDefs: [{ id: "step-def-id", key: "step-a", version: 1 }],
      createClient,
    });

    expect(createClient).toHaveBeenCalledWith("https://my-server.example.com");
  });
});
