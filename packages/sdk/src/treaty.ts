import { treaty } from "@elysiajs/eden";
import type { App } from "@boboddy/api/app";

const TRAILING_SLASHES_PATTERN = /\/+$/u;
const API_SUFFIX_PATTERN = /\/api$/u;

const normalizeBoboddyBaseUrl = (baseUrl: string): string => {
  const trimmedBaseUrl = baseUrl.trim();
  if (trimmedBaseUrl.length === 0) {
    return "";
  }

  return trimmedBaseUrl
    .replace(TRAILING_SLASHES_PATTERN, "")
    .replace(API_SUFFIX_PATTERN, "");
};

export function createBoboddyTreaty(
  baseUrl: string,
): ReturnType<typeof treaty<App>>;
export function createBoboddyTreaty(app: App): ReturnType<typeof treaty<App>>;
export function createBoboddyTreaty(baseUrlOrApp: string | App) {
  if (typeof baseUrlOrApp === "string") {
    return treaty<App>(normalizeBoboddyBaseUrl(baseUrlOrApp), {
      parseDate: false,
    });
  }

  return treaty(baseUrlOrApp, {
    parseDate: false,
  });
}

export type BoboddyTreaty = ReturnType<typeof createBoboddyTreaty>;

type EdenResult<T> = {
  data: T | null | undefined;
  error: { value: unknown } | null | undefined;
};

export const unwrapTreatyResponse = async <T>(
  promise: Promise<EdenResult<T>>,
): Promise<T> => {
  const { data, error } = await promise;

  if (error) {
    throw error.value;
  }

  return data as T;
};

export const createBoboddyApiClient = createBoboddyTreaty;
