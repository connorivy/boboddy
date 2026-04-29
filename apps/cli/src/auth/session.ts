import { CLI_AUTH_CLIENT_ID } from "./config";
import { createCliAuthClient } from "./client";
import { loadAuthProfile, saveAuthProfile } from "./storage";

const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

const sleep = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export async function requestDeviceAuthorization(baseUrl: string) {
  const authClient = createCliAuthClient({ baseUrl });
  const result = await authClient.device.code({
    client_id: CLI_AUTH_CLIENT_ID,
    scope: "openid profile email",
  });

  if (result.error || !result.data) {
    if (result.error?.status === 404) {
      throw new Error(
        `CLI auth endpoints were not found at ${baseUrl}/api/auth/device/code. Make sure the Next app is running with the latest auth changes, or pass the correct --base-url.`,
      );
    }

    throw new Error(
      result.error?.error_description ??
        result.error?.message ??
        `Unable to start CLI authentication (HTTP ${String(result.error?.status ?? "unknown")}).`,
    );
  }

  return result.data;
}

export async function pollForAccessToken({
  baseUrl,
  deviceCode,
  intervalSeconds,
  expiresInSeconds,
}: {
  baseUrl: string;
  deviceCode: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}) {
  const authClient = createCliAuthClient({ baseUrl });
  const deadline = Date.now() + expiresInSeconds * 1000;
  let currentIntervalSeconds = intervalSeconds;

  while (Date.now() < deadline) {
    await sleep(currentIntervalSeconds * 1000);

    const result = await authClient.device.token({
      grant_type: DEVICE_GRANT_TYPE,
      device_code: deviceCode,
      client_id: CLI_AUTH_CLIENT_ID,
    });

    if (result.data?.access_token) {
      return result.data;
    }

    const errorCode = result.error?.error ?? "";
    switch (errorCode) {
      case "authorization_pending":
        continue;
      case "slow_down":
        currentIntervalSeconds += 5;
        continue;
      case "expired_token":
        throw new Error("The CLI sign-in request expired. Run `boboddy auth login` again.");
      case "access_denied":
        throw new Error("CLI access was denied.");
      default:
        throw new Error(
          result.error?.error_description ?? "CLI sign-in could not be completed.",
        );
    }
  }

  throw new Error("Timed out waiting for CLI approval.");
}

export async function fetchAuthenticatedSession({
  baseUrl,
  accessToken,
}: {
  baseUrl: string;
  accessToken: string;
}) {
  const authClient = createCliAuthClient({
    baseUrl,
    accessToken,
  });
  const result = await authClient.getSession();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Authentication required.");
  }

  return result.data;
}

export async function persistAuthenticatedSession({
  baseUrl,
  accessToken,
}: {
  baseUrl: string;
  accessToken: string;
}) {
  const session = await fetchAuthenticatedSession({
    baseUrl,
    accessToken,
  });

  saveAuthProfile(baseUrl, {
    accessToken,
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  return session;
}

export async function loadAuthenticatedSession(baseUrl: string) {
  const profile = loadAuthProfile(baseUrl);
  if (!profile) {
    return null;
  }

  const session = await fetchAuthenticatedSession({
    baseUrl,
    accessToken: profile.accessToken,
  });

  return {
    profile,
    session,
  };
}
