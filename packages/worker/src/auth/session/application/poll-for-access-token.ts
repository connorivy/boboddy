import { CLI_AUTH_CLIENT_ID } from "../infra/auth-config";
import { createCliAuthClient } from "../infra/auth-client";

const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

const sleep = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

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
        throw new Error(
          "The CLI sign-in request expired. Run `boboddy auth login` again.",
        );
      case "access_denied":
        throw new Error("CLI access was denied.");
      default:
        throw new Error(
          result.error?.error_description ??
            "CLI sign-in could not be completed.",
        );
    }
  }

  throw new Error("Timed out waiting for CLI approval.");
}
