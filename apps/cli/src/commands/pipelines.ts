import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createStepDefinitionsClient } from "@boboddy/sdk/definitions/steps";
import { resolveBoboddyBaseUrl } from "../auth/config";
import { loadAuthenticatedSession } from "../auth/session";
import { createCliLogger } from "../lib/logger";
import { readProjectConfig } from "../init/project-config";
import {
  scaffoldPipelineBuilderDirectory,
  type StepInfo,
} from "../pipelines/pipeline-builder-scaffolder";

const PIPELINE_BUILDER_DIR = ".boboddy/pipeline-builder";

const DUMMY_STEPS: StepInfo[] = [
  {
    key: "evaluate-clarity",
    name: "Evaluate Clarity",
    version: 1,
    signals: [{ key: "clarity_score", sourcePath: "score", type: "number" }],
  },
  {
    key: "evaluate-tone",
    name: "Evaluate Tone",
    version: 1,
    signals: [{ key: "tone_score", sourcePath: "score", type: "number" }],
  },
];

// pull

interface PullArguments {
  baseUrl: string | undefined;
}

const runPull = async (
  args: ArgumentsCamelCase<PullArguments>,
): Promise<void> => {
  const logger = createCliLogger("pipelines-pull");
  const baseUrl = resolveBoboddyBaseUrl(args.baseUrl);

  if (!existsSync(join(process.cwd(), ".git"))) {
    logger.error(
      "`boboddy pipelines pull` must be run from the root of a git repository. Navigate to your repo root and try again.",
    );
    process.exit(1);
  }

  let steps: StepInfo[] = DUMMY_STEPS;

  const projectConfig = await readProjectConfig();
  const projectId = projectConfig?.projectId;

  if (projectId) {
    const authenticated = await loadAuthenticatedSession(baseUrl);
    if (authenticated) {
      const headers = {
        Authorization: `Bearer ${authenticated.profile.accessToken}`,
      };
      try {
        const client = createStepDefinitionsClient(baseUrl);
        const apiSteps = await client.listByProjectId(projectId, { headers });
        if (apiSteps.length > 0) {
          steps = apiSteps.map((s) => ({
            key: s.key,
            name: s.name,
            version: s.version,
            signals: s.signalExtractorDefinitions.map((sig) => ({
              key: sig.key,
              sourcePath: sig.sourcePath,
              type: sig.type,
            })),
          }));
          logger.info(
            { count: steps.length },
            `Fetched ${String(steps.length)} step definition(s) from the API`,
          );
        } else {
          logger.info(
            "No step definitions found for this project — using example data",
          );
        }
      } catch (err) {
        logger.warn(
          { err },
          "Failed to fetch step definitions from the API — using example data",
        );
      }
    } else {
      logger.info(
        "Not signed in — using example data. Run `boboddy auth login` to pull your real steps.",
      );
    }
  } else {
    logger.info(
      "No project ID found — using example data. Run `boboddy init` to connect a project.",
    );
  }

  const dir = join(process.cwd(), PIPELINE_BUILDER_DIR);
  const result = scaffoldPipelineBuilderDirectory(dir, steps);

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

const pullCommand: CommandModule<object, PullArguments> = {
  command: "pull",
  describe: `Scaffold ${PIPELINE_BUILDER_DIR} with step and pipeline definitions`,
  builder: (argv: Argv<object>) =>
    argv.option("baseUrl", {
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
    argv.command(pullCommand).demandCommand(1, "A pipelines command is required."),
  handler: () => undefined,
};
