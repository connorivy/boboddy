import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { createCliLogger } from "../lib/logger";
import { CLI_AUTH_CLIENT_ID, resolveBoboddyBaseUrl } from "../auth/config";
import { openBrowser } from "../auth/browser";
import {
  loadAuthenticatedSession,
  persistAuthenticatedSession,
  pollForAccessToken,
  requestDeviceAuthorization,
} from "../auth/session";
import { deleteAuthProfile, loadAuthProfile } from "../auth/storage";

const addBaseUrlOption = (argv: Argv<object>) =>
  argv.option("base-url", {
    type: "string",
    describe: "Boboddy app base URL",
  });

const getBaseUrlArgument = (arguments_: ArgumentsCamelCase<object>) => {
  const value = arguments_["base-url"];
  return typeof value === "string" ? value : undefined;
};

const runLogin = async (arguments_: ArgumentsCamelCase<object>) => {
  const logger = createCliLogger("auth");
  const baseUrl = resolveBoboddyBaseUrl(getBaseUrlArgument(arguments_));
  const deviceAuth = await requestDeviceAuthorization(baseUrl);

  logger.info("Open this URL to approve the CLI");
  logger.info(
    { url: deviceAuth.verification_uri_complete || deviceAuth.verification_uri },
    "Approval URL",
  );
  logger.info({ code: deviceAuth.user_code }, "CLI code");
  logger.info({ clientId: CLI_AUTH_CLIENT_ID }, "Auth client");

  try {
    await openBrowser(deviceAuth.verification_uri_complete || deviceAuth.verification_uri);
  } catch {
    logger.warn(
      "Could not open a browser automatically. Open the URL above manually.",
    );
  }

  logger.info("Waiting for approval");

  const tokenResponse = await pollForAccessToken({
    baseUrl,
    deviceCode: deviceAuth.device_code,
    intervalSeconds: deviceAuth.interval,
    expiresInSeconds: deviceAuth.expires_in,
  });

  const session = await persistAuthenticatedSession({
    baseUrl,
    accessToken: tokenResponse.access_token,
  });

  logger.info({ email: session.user.email }, "Signed in");
};

const runStatus = async (arguments_: ArgumentsCamelCase<object>) => {
  const logger = createCliLogger("auth");
  const baseUrl = resolveBoboddyBaseUrl(getBaseUrlArgument(arguments_));
  const profile = loadAuthProfile(baseUrl);

  if (!profile) {
    logger.info({ baseUrl }, "Not signed in");
    return;
  }

  try {
    const authenticated = await loadAuthenticatedSession(baseUrl);
    if (!authenticated) {
      logger.info({ baseUrl }, "Not signed in");
      return;
    }

    logger.info(
      { baseUrl, email: authenticated.session.user.email },
      "Signed in",
    );
  } catch {
    logger.warn({ baseUrl }, "Stored credentials are no longer valid");
  }
};

const runWhoAmI = async (arguments_: ArgumentsCamelCase<object>) => {
  const logger = createCliLogger("auth");
  const baseUrl = resolveBoboddyBaseUrl(getBaseUrlArgument(arguments_));
  const authenticated = await loadAuthenticatedSession(baseUrl);

  if (!authenticated) {
    throw new Error(`Not signed in to ${baseUrl}.`);
  }

  logger.info({ email: authenticated.session.user.email }, "Authenticated user");
};

const runLogout = async (arguments_: ArgumentsCamelCase<object>) => {
  const logger = createCliLogger("auth");
  const baseUrl = resolveBoboddyBaseUrl(getBaseUrlArgument(arguments_));
  deleteAuthProfile(baseUrl);
  logger.info({ baseUrl }, "Signed out");
};

const loginCommand: CommandModule<object, object> = {
  command: "login",
  describe: "Authenticate this CLI via browser approval",
  builder: addBaseUrlOption,
  handler: runLogin,
};

const statusCommand: CommandModule<object, object> = {
  command: "status",
  describe: "Show current CLI authentication status",
  builder: addBaseUrlOption,
  handler: runStatus,
};

const whoamiCommand: CommandModule<object, object> = {
  command: "whoami",
  describe: "Print the authenticated user email",
  builder: addBaseUrlOption,
  handler: runWhoAmI,
};

const logoutCommand: CommandModule<object, object> = {
  command: "logout",
  describe: "Remove stored CLI credentials",
  builder: addBaseUrlOption,
  handler: runLogout,
};

export const authCommand: CommandModule<object, object> = {
  command: "auth <command>",
  describe: "Authenticate the Boboddy CLI",
  builder: (argv) =>
    argv
      .command(loginCommand)
      .command(statusCommand)
      .command(whoamiCommand)
      .command(logoutCommand)
      .demandCommand(1, "An auth command is required."),
  handler: async () => undefined,
};
