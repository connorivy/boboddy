import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createStepDefinitionsClient } from "@boboddy/sdk/step-definitions-client";
import { resolveBoboddyBaseUrl } from "../auth/config";
import { loadAuthenticatedSession } from "../auth/session";
import { createCliLogger } from "../lib/logger";
import { loadStepsFromDirectory } from "../steps/step-file-loader";
import { scaffoldStepsDirectory } from "../steps/step-scaffolder";
import { readProjectConfig } from "../init/project-config";

const STEPS_DIR = ".boboddy/steps";

// init

const runInit = (): void => {
  const logger = createCliLogger("steps-init");

  if (!existsSync(join(process.cwd(), ".git"))) {
    logger.error(
      "`boboddy steps init` must be run from the root of a git repository. Navigate to your repo root and try again.",
    );
    process.exit(1);
  }

  const dir = join(process.cwd(), STEPS_DIR);

  const result = scaffoldStepsDirectory(dir);

  for (const file of result.created) {
    logger.info({ file }, `Created ${file}`);
  }
  for (const file of result.skipped) {
    logger.warn({ file }, `Skipped ${file} (already exists)`);
  }

  logger.info(
    { dir },
    `Initialized steps directory at ${STEPS_DIR}. Run \`bun install\` then \`boboddy steps push\``,
  );
};

const initCommand: CommandModule<object, object> = {
  command: "init",
  describe: `Scaffold the ${STEPS_DIR} directory with package.json, tsconfig.json, and an example step`,
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
  const logger = createCliLogger("steps-push");
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
  const dir = join(process.cwd(), STEPS_DIR);

  const specs = await loadStepsFromDirectory(dir);
  logger.info({ count: specs.length }, `Found ${String(specs.length)} step definition(s)`);

  if (specs.length === 0) {
    logger.info("Nothing to push.");
    return;
  }

  const client = createStepDefinitionsClient(baseUrl);
  const existing = await client.listByProjectId(projectId, { headers });

  const existingById = new Map<string, string>();
  for (const step of existing) {
    existingById.set(`${step.key}@v${String(step.version)}`, step.id);
  }

  let created = 0;
  let updated = 0;

  for (const spec of specs) {
    const lookup = `${spec.key}@v${String(spec.version)}`;
    const existingId = existingById.get(lookup);
    const payload = { ...spec, projectId };

    if (existingId) {
      await client.update(existingId, payload, { headers });
      updated++;
      logger.info({ key: spec.key, version: spec.version }, `✓ ${spec.key} v${String(spec.version)} → updated`);
    } else {
      await client.create(payload, { headers });
      created++;
      logger.info({ key: spec.key, version: spec.version }, `✓ ${spec.key} v${String(spec.version)} → created`);
    }
  }

  logger.info(
    { created, updated },
    `Pushed ${String(created + updated)} step definition(s) (${String(created)} created, ${String(updated)} updated)`,
  );
};

const pushCommand: CommandModule<object, PushArguments> = {
  command: "push [projectId]",
  describe: `Push step definitions from ${STEPS_DIR} to the server`,
  builder: (argv: Argv<object>) =>
    argv
      .positional("projectId", {
        describe:
          "The project to push steps to (defaults to the id in .boboddy/boboddy.jsonc)",
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

export const stepsCommand: CommandModule<object, object> = {
  command: "steps <command>",
  describe: "Manage step definitions",
  builder: (argv) =>
    argv
      .command(initCommand)
      .command(pushCommand)
      .demandCommand(1, "A steps command is required."),
  handler: () => undefined,
};
