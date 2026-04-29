import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
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
  const baseUrl = resolveBoboddyBaseUrl(getBaseUrlArgument(arguments_));
  const deviceAuth = await requestDeviceAuthorization(baseUrl);

  console.log(`Open this URL to approve the CLI:`);
  console.log(deviceAuth.verification_uri_complete || deviceAuth.verification_uri);
  console.log(`CLI code: ${deviceAuth.user_code}`);
  console.log(`Client: ${CLI_AUTH_CLIENT_ID}`);

  try {
    await openBrowser(deviceAuth.verification_uri_complete || deviceAuth.verification_uri);
  } catch {
    console.log("Could not open a browser automatically. Open the URL above manually.");
  }

  console.log("Waiting for approval...");

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

  console.log(`Signed in as ${session.user.email}.`);
};

const runStatus = async (arguments_: ArgumentsCamelCase<object>) => {
  const baseUrl = resolveBoboddyBaseUrl(getBaseUrlArgument(arguments_));
  const profile = loadAuthProfile(baseUrl);

  if (!profile) {
    console.log(`Not signed in to ${baseUrl}.`);
    return;
  }

  try {
    const authenticated = await loadAuthenticatedSession(baseUrl);
    if (!authenticated) {
      console.log(`Not signed in to ${baseUrl}.`);
      return;
    }

    console.log(`Signed in to ${baseUrl} as ${authenticated.session.user.email}.`);
  } catch {
    console.log(`Stored credentials for ${baseUrl} are no longer valid.`);
  }
};

const runWhoAmI = async (arguments_: ArgumentsCamelCase<object>) => {
  const baseUrl = resolveBoboddyBaseUrl(getBaseUrlArgument(arguments_));
  const authenticated = await loadAuthenticatedSession(baseUrl);

  if (!authenticated) {
    throw new Error(`Not signed in to ${baseUrl}.`);
  }

  console.log(authenticated.session.user.email);
};

const runLogout = async (arguments_: ArgumentsCamelCase<object>) => {
  const baseUrl = resolveBoboddyBaseUrl(getBaseUrlArgument(arguments_));
  deleteAuthProfile(baseUrl);
  console.log(`Signed out from ${baseUrl}.`);
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
