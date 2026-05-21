import { existsSync } from "node:fs";
import { join } from "node:path";
import type { StepDefinitionSpec } from "@boboddy/sdk/definitions/steps";
import { createStepDefinitionsClient } from "@boboddy/sdk/definitions/steps";
import { loadStepsFromDirectory } from "./load-steps-from-directory";

export const STEPS_DIR = ".boboddy/steps";
export const PIPELINE_BUILDER_DIR = ".boboddy/pipeline-builder";

type StepPushLogger = {
  info: (obj: unknown, msg?: string) => void;
};

type ExistingStepDefinition = {
  id: string;
  key: string;
  version: number;
};

type StepDefinitionsClient = {
  listByProjectId: (
    projectId: string,
    options: { headers: { Authorization: string } },
  ) => Promise<ExistingStepDefinition[]>;
  update: (
    id: string,
    body: StepDefinitionSpec & { projectId: string },
    options: { headers: { Authorization: string } },
  ) => Promise<unknown>;
  create: (
    body: StepDefinitionSpec & { projectId: string },
    options: { headers: { Authorization: string } },
  ) => Promise<unknown>;
};

interface PushStepDefinitionsOptions {
  projectId: string;
  baseUrl: string;
  headers: { Authorization: string };
  logger: StepPushLogger;
  dir?: string;
  cwd?: string;
  skipMissingDirectory?: boolean;
  loadSteps?: (dir: string) => Promise<StepDefinitionSpec[]>;
  createClient?: (baseUrl: string) => StepDefinitionsClient;
}

export interface PushStepDefinitionsResult {
  found: number;
  created: number;
  updated: number;
  skippedMissingDirectory: boolean;
}

export async function pushStepDefinitions(
  options: PushStepDefinitionsOptions,
): Promise<PushStepDefinitionsResult> {
  const cwd = options.cwd ?? process.cwd();
  const dir = join(cwd, options.dir ?? STEPS_DIR);

  if (!existsSync(dir)) {
    if (options.skipMissingDirectory) {
      return {
        found: 0,
        created: 0,
        updated: 0,
        skippedMissingDirectory: true,
      };
    }
  }

  const loadSteps = options.loadSteps ?? loadStepsFromDirectory;
  const client = (options.createClient ?? createStepDefinitionsClient)(
    options.baseUrl,
  );
  const specs = await loadSteps(dir);

  options.logger.info(
    { count: specs.length },
    `Found ${String(specs.length)} step definition(s)`,
  );

  if (specs.length === 0) {
    options.logger.info("Nothing to push.");
    return {
      found: 0,
      created: 0,
      updated: 0,
      skippedMissingDirectory: false,
    };
  }

  const existing = await client.listByProjectId(options.projectId, {
    headers: options.headers,
  });

  const existingById = new Map<string, string>();
  for (const step of existing) {
    existingById.set(`${step.key}@v${String(step.version)}`, step.id);
  }

  let created = 0;
  let updated = 0;

  for (const spec of specs) {
    const lookup = `${spec.key}@v${String(spec.version)}`;
    const existingId = existingById.get(lookup);
    const payload = { ...spec, projectId: options.projectId };

    if (existingId) {
      await client.update(existingId, payload, { headers: options.headers });
      updated++;
      options.logger.info(
        { key: spec.key, version: spec.version },
        `✓ ${spec.key} v${String(spec.version)} → updated`,
      );
    } else {
      await client.create(payload, { headers: options.headers });
      created++;
      options.logger.info(
        { key: spec.key, version: spec.version },
        `✓ ${spec.key} v${String(spec.version)} → created`,
      );
    }
  }

  options.logger.info(
    { created, updated },
    `Pushed ${String(created + updated)} step definition(s) (${String(created)} created, ${String(updated)} updated)`,
  );

  return {
    found: specs.length,
    created,
    updated,
    skippedMissingDirectory: false,
  };
}
