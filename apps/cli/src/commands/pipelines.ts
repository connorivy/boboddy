import type { CommandModule } from "yargs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createCliLogger } from "../lib/logger";
import {
  scaffoldPipelineBuilderDirectory,
  type StepInfo,
} from "../pipelines/pipeline-builder-scaffolder";

const PIPELINE_BUILDER_DIR = ".boboddy/pipeline-builder";

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
    `Pipeline builder scaffolded at ${PIPELINE_BUILDER_DIR}. Run \`bun install\` to get started.`,
  );
};

const initCommand: CommandModule<object, object> = {
  command: "init",
  describe: `Scaffold ${PIPELINE_BUILDER_DIR} with an example pipeline`,
  builder: (argv) => argv,
  handler: runInit,
};

// parent

export const pipelinesCommand: CommandModule<object, object> = {
  command: "pipelines <command>",
  describe: "Manage pipeline definitions",
  builder: (argv) =>
    argv
      .command(initCommand)
      .demandCommand(1, "A pipelines command is required."),
  handler: () => undefined,
};
