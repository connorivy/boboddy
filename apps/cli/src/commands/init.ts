import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { resolveBoboddyBaseUrl } from "../auth/config";
import { ensureDevcontainer } from "../init/ensure-devcontainer";
import { globalSetup } from "../init/global-setup";
import { localConfigSetup } from "../init/local-config-setup";
import { recommendPipelines } from "../init/recommend-pipelines";
import { verifyRequirements } from "../init/verify-requirements";

async function runInit(
  argv: ArgumentsCamelCase<{ baseUrl?: string }>,
): Promise<void> {
  const baseUrl = resolveBoboddyBaseUrl(argv.baseUrl);
  const { headers, client } = await verifyRequirements({ baseUrl });
  await globalSetup();
  const result = await localConfigSetup({ headers, client });
  if (result) {
    await ensureDevcontainer({ baseUrl, projectId: result.projectId });
    await recommendPipelines({
      baseUrl,
      client,
      headers,
      projectId: result.projectId,
    });
  }
}

const addBaseUrlOption = (argv: Argv<object>) =>
  argv.option("base-url", {
    type: "string",
    describe: "Boboddy app base URL",
  });

export const initCommand: CommandModule = {
  command: "init",
  describe: "Initialize boboddy globally and for the current project",
  builder: addBaseUrlOption,
  handler: runInit,
};
