import { createBoboddyClient } from "@boboddy/sdk";
import type { PipelineDefinitionSpec } from "@boboddy/sdk/definitions/pipelines";

export type StepDefEntry = {
  id: string;
  key: string;
  version: number;
};

type PipelineClient = {
  listPipelineDefinitions: (options: {
    query: { projectId: string };
    headers: Record<string, unknown>;
  }) => Promise<{ data?: Array<{ key: string }> | null }>;
  upsertPipelineDefinition: (options: {
    body: {
      projectId: string;
      key: string;
      name: string;
      description: unknown;
      version: number;
      status: "draft" | "active" | "archived";
      stepDefinitions: Array<{
        stepDefinitionId: string;
        stepDefinitionVersion: number;
        key: string;
        name: string;
        description: unknown;
        position: number;
        inputBindingsJson: unknown;
        timeoutSeconds: unknown;
        retryPolicyJson: null;
        advancementPolicyDefinition: unknown;
        computedSignalDefinitions: Array<{
          key: string;
          type: string;
          inputSignalKeys: string[];
          configJson: Record<string, unknown> | null;
          availableWhenResultStatusIn: string[] | null;
        }>;
      }>;
    };
    headers: Record<string, unknown>;
  }) => Promise<unknown>;
};

type PipelinePushLogger = {
  info: (obj: unknown, msg?: string) => void;
};

export interface PushPipelineDefinitionsOptions {
  projectId: string;
  baseUrl: string;
  headers: { Authorization: string };
  logger: PipelinePushLogger;
  specs: PipelineDefinitionSpec[];
  stepDefs: StepDefEntry[];
  createClient?: (baseUrl: string) => PipelineClient;
}

export interface PushPipelineDefinitionsResult {
  pushed: number;
}

function extractRoutePipelineKeys(policy: {
  defaultEventType: string;
  defaultEventParamsJson: Record<string, unknown> | null;
  rulesJson: { rules: Array<{ event: { type: string; params?: Record<string, unknown> } }> };
}): string[] {
  const keys: string[] = [];
  if (
    policy.defaultEventType === "route" &&
    typeof policy.defaultEventParamsJson?.["pipelineKey"] === "string"
  ) {
    keys.push(policy.defaultEventParamsJson["pipelineKey"] as string);
  }
  for (const rule of policy.rulesJson.rules) {
    if (
      rule.event.type === "route" &&
      typeof rule.event.params?.["pipelineKey"] === "string"
    ) {
      keys.push(rule.event.params["pipelineKey"] as string);
    }
  }
  return keys;
}

export async function pushPipelineDefinitions(
  options: PushPipelineDefinitionsOptions,
): Promise<PushPipelineDefinitionsResult> {
  const stepDefMap = new Map<string, StepDefEntry>();
  for (const s of options.stepDefs) {
    const existing = stepDefMap.get(s.key);
    if (!existing || s.version > existing.version) {
      stepDefMap.set(s.key, s);
    }
  }

  const createClient =
    options.createClient ??
    ((baseUrl: string) =>
      createBoboddyClient(baseUrl).pipelineDefinitions as unknown as PipelineClient);
  const client = createClient(options.baseUrl);

  // Build set of pipeline keys being pushed in this batch
  const localPipelineKeys = new Set(options.specs.map((s) => s.key));

  // Fetch existing pipeline keys from server
  const existingPipelinesResult = await client.listPipelineDefinitions({
    query: { projectId: options.projectId },
    headers: options.headers,
  });
  const serverPipelineKeys = new Set(
    existingPipelinesResult.data?.map((p) => p.key) ?? [],
  );
  const knownPipelineKeys = new Set([...localPipelineKeys, ...serverPipelineKeys]);

  // Validate all route pipelineKey references
  for (const spec of options.specs) {
    for (const step of spec.steps) {
      const routeKeys = extractRoutePipelineKeys(step.advancementPolicyDefinition);
      for (const routeKey of routeKeys) {
        if (!knownPipelineKeys.has(routeKey)) {
          throw new Error(
            `Pipeline "${spec.key}" step "${step.stepKey}" routes to pipeline "${routeKey}", ` +
              `but no pipeline with that key was found on the server or in the current push batch. ` +
              `Push the target pipeline first.`,
          );
        }
      }
    }
  }

  for (const spec of options.specs) {
    const stepDefinitions = spec.steps.map((step) => {
      const stepDef = stepDefMap.get(step.stepKey);
      if (!stepDef) {
        throw new Error(
          `Step "${step.stepKey}" referenced in pipeline "${spec.key}" was not found on the server. ` +
            `Run \`boboddy steps push\` first to push your step definitions.`,
        );
      }
      return {
        stepDefinitionId: stepDef.id,
        stepDefinitionVersion: stepDef.version,
        key: step.stepKey,
        name: step.stepName,
        description: step.stepDescription,
        position: step.position,
        inputBindingsJson: step.inputBindingsJson as Record<string, unknown>,
        timeoutSeconds: step.timeoutSeconds,
        retryPolicyJson: null as null,
        advancementPolicyDefinition: step.advancementPolicyDefinition,
        computedSignalDefinitions: step.computedSignalDefinitions,
      };
    });

    await client.upsertPipelineDefinition({
      body: {
        projectId: options.projectId,
        key: spec.key,
        name: spec.name,
        description: spec.description,
        version: spec.version,
        status: spec.status,
        stepDefinitions,
      },
      headers: options.headers,
    });

    options.logger.info(
      { key: spec.key, version: spec.version },
      `✓ ${spec.key} v${String(spec.version)} → upserted`,
    );
  }

  options.logger.info(
    { count: options.specs.length },
    `Pushed ${String(options.specs.length)} pipeline definition(s)`,
  );

  return { pushed: options.specs.length };
}
