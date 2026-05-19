import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createPipelineDefinitionsClient } from "@boboddy/sdk/definitions/pipelines";
import { createStepDefinitionsClient } from "@boboddy/sdk/definitions/steps";
import { resolveBoboddyBaseUrl } from "../auth/config";
import { loadAuthenticatedSession } from "../auth/session";
import { createCliLogger } from "../lib/logger";
import {
  scaffoldPipelineBuilderDirectory,
  type StepInfo,
} from "../pipelines/pipeline-builder-scaffolder";
import { loadPipelinesFromDirectory } from "../pipelines/pipeline-file-loader";
import { loadPipelineStepsFromDirectory } from "../pipelines/pipeline-step-file-loader";
import { readProjectConfig } from "../init/project-config";
import {
  PIPELINE_BUILDER_DIR,
  pushStepDefinitions,
} from "../steps/push-step-definitions";

const DUMMY_STEPS: StepInfo[] = [
  {
    key: "investigate",
    name: "Investigate",
    version: 1,
    prompt:
      "You are an expert investigator. Analyze the provided content thoroughly to identify the root cause, assess the severity, and recommend next steps.",
    signals: [{ key: "confidence", sourcePath: "confidence", type: "number" }],
  },
];

// init

const runInit = async (): Promise<void> => {
  const logger = createCliLogger("pipelines-init");

  if (!existsSync(join(process.cwd(), ".git"))) {
    logger.error(
      "`boboddy pipelines init` must be run from the root of a git repository. Navigate to your repo root and try again.",
    );
    process.exit(1);
  }

  const dir = join(process.cwd(), PIPELINE_BUILDER_DIR);
  const result = scaffoldPipelineBuilderDirectory(dir, DUMMY_STEPS);

  for (const file of result.created) {
    logger.info({ file }, `Created ${file}`);
  }
  for (const file of result.skipped) {
    logger.warn({ file }, `Skipped ${file} (already exists)`);
  }

  logger.info(
    { dir },
    `Pipeline builder scaffolded at ${PIPELINE_BUILDER_DIR}. Run \`npm install\` or \`bun install\` to get started.`,
  );
};

const initCommand: CommandModule<object, object> = {
  command: "init",
  describe: `Scaffold ${PIPELINE_BUILDER_DIR} with an example pipeline`,
  builder: (argv) => argv,
  handler: runInit,
};

// push

interface PushArguments {
  projectId: string | undefined;
  baseUrl: string | undefined;
}

const runPush = async (
  args: ArgumentsCamelCase<PushArguments>,
): Promise<void> => {
  const logger = createCliLogger("pipelines-push");
  const baseUrl = resolveBoboddyBaseUrl(args.baseUrl);

  const projectId = args.projectId ?? (await readProjectConfig())?.projectId;
  if (!projectId) {
    logger.error(
      "No project ID provided. Pass one as an argument or run `boboddy init` first.",
    );
    process.exit(1);
  }

  const authenticated = await loadAuthenticatedSession(baseUrl);
  if (!authenticated) {
    throw new Error(
      `Not signed in to ${baseUrl}. Run \`boboddy auth login\` first.`,
    );
  }

  const headers = { Authorization: `Bearer ${authenticated.profile.accessToken}` };
  const dir = join(process.cwd(), PIPELINE_BUILDER_DIR);

  const specs = await loadPipelinesFromDirectory(dir);
  logger.info(
    { count: specs.length },
    `Found ${String(specs.length)} pipeline definition(s)`,
  );

  if (specs.length === 0) {
    logger.info("Nothing to push.");
    return;
  }

  await pushStepDefinitions({
    projectId,
    baseUrl,
    headers,
    logger,
    dir: PIPELINE_BUILDER_DIR,
    skipMissingDirectory: true,
    loadSteps: loadPipelineStepsFromDirectory,
  });

  // Build a map of step key → server step def (needed to resolve IDs)
  const stepDefsClient = createStepDefinitionsClient(baseUrl);
  const stepDefs = await stepDefsClient.listByProjectId(projectId, { headers });

  type StepDefEntry = { id: string; key: string; version: number; name: string; description: string | null };
  const stepDefMap = new Map<string, StepDefEntry>();
  for (const s of stepDefs as StepDefEntry[]) {
    const existing = stepDefMap.get(s.key);
    if (!existing || s.version > existing.version) {
      stepDefMap.set(s.key, s);
    }
  }

  const pipelineClient = createPipelineDefinitionsClient(baseUrl);
  const existingPipelines = await pipelineClient.listByProjectId(projectId, { headers });

  const existingByKey = new Map<
    string,
    { id: string; steps: { id: string; key: string }[] }
  >();
  for (const p of existingPipelines) {
    existingByKey.set(`${p.key}@v${String(p.version)}`, {
      id: p.id,
      steps: p.steps ?? [],
    });
  }

  let created = 0;
  let updated = 0;

  for (const spec of specs) {
    const lookup = `${spec.key}@v${String(spec.version)}`;
    const existingPipeline = existingByKey.get(lookup);

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

    if (!existingPipeline) {
      await pipelineClient.create(
        {
          projectId,
          key: spec.key,
          name: spec.name,
          description: spec.description,
          version: spec.version,
          status: spec.status,
          stepDefinitions,
        },
        { headers },
      );
      created++;
      logger.info(
        { key: spec.key, version: spec.version },
        `✓ ${spec.key} v${String(spec.version)} → created`,
      );
    } else {
      await pipelineClient.update(
        existingPipeline.id,
        {
          projectId,
          key: spec.key,
          name: spec.name,
          description: spec.description,
          version: spec.version,
          status: spec.status,
        },
        { headers },
      );

      for (const existingStep of existingPipeline.steps) {
        await pipelineClient.removeStep(existingPipeline.id, existingStep.id, { headers });
      }

      for (const stepInput of stepDefinitions) {
        await pipelineClient.addStep(existingPipeline.id, stepInput, { headers });
      }

      updated++;
      logger.info(
        { key: spec.key, version: spec.version },
        `✓ ${spec.key} v${String(spec.version)} → updated`,
      );
    }
  }

  logger.info(
    { created, updated },
    `Pushed ${String(created + updated)} pipeline definition(s) (${String(created)} created, ${String(updated)} updated)`,
  );
};

const pushCommand: CommandModule<object, PushArguments> = {
  command: "push [projectId]",
  describe: `Push pipeline definitions from ${PIPELINE_BUILDER_DIR} to the server`,
  builder: (argv: Argv<object>) =>
    argv
      .positional("projectId", {
        describe:
          "The project to push pipelines to (defaults to the id in .boboddy/boboddy.jsonc)",
        type: "string",
      })
      .option("baseUrl", {
        alias: "base-url",
        type: "string",
        describe: "Boboddy app base URL",
      }),
  handler: runPush,
};

// parent

export const pipelinesCommand: CommandModule<object, object> = {
  command: "pipelines <command>",
  describe: "Manage pipeline definitions",
  builder: (argv) =>
    argv
      .command(initCommand)
      .command(pushCommand)
      .demandCommand(1, "A pipelines command is required."),
  handler: () => undefined,
};
