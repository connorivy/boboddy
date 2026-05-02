const DEFAULT_BASE_URL = "http://localhost:3000";

export const CLI_AUTH_CLIENT_ID = "boboddy-cli";

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/u, "");

export const resolveBoboddyBaseUrl = (value?: string | null) => {
  const trimmedValue = value?.trim();
  if (trimmedValue) {
    return trimTrailingSlashes(trimmedValue);
  }

  const envValue = process.env["BOBODDY_BASE_URL"]?.trim();
  if (envValue) {
    return trimTrailingSlashes(envValue);
  }

  return DEFAULT_BASE_URL;
};
