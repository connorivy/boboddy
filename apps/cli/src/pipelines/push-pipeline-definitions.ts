import { createBoboddyClient } from "@boboddy/sdk";
import type { PipelineDefinitionSpec } from "@boboddy/sdk/definitions/pipelines";

export type StepDefEntry = {
  id: string;
  key: string;
  version: number;
};

type PipelineClient = {
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
    ((baseUrl: string) => createBoboddyClient(baseUrl).pipelineDefinitions);
  const client = createClient(options.baseUrl);

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
