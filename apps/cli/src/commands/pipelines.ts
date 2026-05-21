import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { createStepDefinitionsClient } from "@boboddy/sdk/definitions/steps";
import {
  listExistingPipelineBuilderFiles,
  loadAuthenticatedSession,
  loadPipelinesFromDirectory,
  loadPipelineStepsFromDirectory,
  PIPELINE_BUILDER_DIR,
  pullPipelineDefinitions,
  pushPipelineDefinitions,
  pushStepDefinitions,
  readProjectConfig,
  resolveBoboddyBaseUrl,
  scaffoldPipelineBuilderDirectory,
  type StepInfo,
} from "@boboddy/worker";
import { version as CLI_VERSION } from "../../package.json";
import { createCliLogger } from "../lib/logger";

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
  const result = scaffoldPipelineBuilderDirectory(dir, DUMMY_STEPS, CLI_VERSION);

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

  const stepDefsClient = createStepDefinitionsClient(baseUrl);
  const stepDefs = await stepDefsClient.listByProjectId(projectId, { headers });

  await pushPipelineDefinitions({
    projectId,
    baseUrl,
    headers,
    logger,
    specs,
    stepDefs: stepDefs as { id: string; key: string; version: number }[],
  });
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

// pull

async function confirmOverwrite(files: string[]): Promise<boolean> {
  if (files.length === 0) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const list = files.map((f) => `  - ${f}`).join("\n");
    rl.question(
      `The following files will be overwritten:\n${list}\n\nContinue? (Y/n) `,
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() !== "n");
      },
    );
  });
}

interface PullArguments {
  projectId: string | undefined;
  baseUrl: string | undefined;
}

const runPull = async (args: ArgumentsCamelCase<PullArguments>): Promise<void> => {
  const logger = createCliLogger("pipelines-pull");
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
    throw new Error(`Not signed in to ${baseUrl}. Run \`boboddy auth login\` first.`);
  }

  const headers = { Authorization: `Bearer ${authenticated.profile.accessToken}` };
  const dir = join(process.cwd(), PIPELINE_BUILDER_DIR);

  const existingFiles = listExistingPipelineBuilderFiles(dir);
  const confirmed = await confirmOverwrite(existingFiles);
  if (!confirmed) {
    logger.info({}, "Pull cancelled.");
    return;
  }

  const result = await pullPipelineDefinitions({ projectId, baseUrl, headers, logger, dir });

  if (result.stepFiles === 0 && result.pipelineFiles === 0) return;

  const freshlyScaffolded = existingFiles.length === 0;
  if (freshlyScaffolded) {
    logger.info(
      { dir },
      `Run \`npm install\` or \`bun install\` inside ${PIPELINE_BUILDER_DIR} to install dependencies.`,
    );
  }

  logger.info(
    { pipelineFiles: result.pipelineFiles, stepFiles: result.stepFiles },
    `Pull complete. ${String(result.pipelineFiles)} pipeline file(s), ${String(result.stepFiles)} step file(s).`,
  );
};

const pullCommand: CommandModule<object, PullArguments> = {
  command: "pull [projectId]",
  describe: `Pull pipeline and step definitions from the server into ${PIPELINE_BUILDER_DIR}`,
  builder: (argv: Argv<object>) =>
    argv
      .positional("projectId", {
        describe:
          "The project to pull pipelines from (defaults to the id in .boboddy/boboddy.jsonc)",
        type: "string",
      })
      .option("baseUrl", {
        alias: "base-url",
        type: "string",
        describe: "Boboddy app base URL",
      }),
  handler: runPull,
};

// parent

export const pipelinesCommand: CommandModule<object, object> = {
  command: "pipelines <command>",
  describe: "Manage pipeline definitions",
  builder: (argv) =>
    argv
      .command(initCommand)
      .command(pushCommand)
      .command(pullCommand)
      .demandCommand(1, "A pipelines command is required."),
  handler: () => undefined,
};
