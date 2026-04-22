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

export function createBoboddyTreaty(baseUrl: string): ReturnType<typeof treaty<App>>;
export function createBoboddyTreaty(app: App): ReturnType<typeof treaty<App>>;
export function createBoboddyTreaty(baseUrlOrApp: string | App) {
  if (typeof baseUrlOrApp === "string") {
    return treaty<App>(normalizeBoboddyBaseUrl(baseUrlOrApp));
  }

  return treaty(baseUrlOrApp);
}

export type BoboddyTreaty = ReturnType<typeof createBoboddyTreaty>;
