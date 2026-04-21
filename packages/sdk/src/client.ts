import {
  type Auth,
  type Client,
  type ClientOptions,
  createClient as createGeneratedClient,
  type Config,
} from "./client/client/index.js";
import { client as defaultClient } from "./client/client.gen.js";
import { BoboddyClient } from "./client/sdk.gen.js";

export * from "./client/index.js";
export {
  client as generatedClient,
  type CreateClientConfig,
} from "./client/client.gen.js";
export {
  BoboddyClient,
} from "./client/sdk.gen.js";
export {
  createClient as createGeneratedClient,
  type Auth,
  type Client,
  type ClientOptions,
  type Config,
} from "./client/client/index.js";

export type BoboddyClientOptions = Config<ClientOptions> & {
  apiKey?: string;
};

const resolveAuth = (
  apiKey: string | undefined,
  auth: Config<ClientOptions>["auth"],
) => {
  if (!apiKey) {
    return auth;
  }

  return async (security: Auth) => {
    if (
      security.type === "apiKey" &&
      security.in === "header" &&
      security.name === "x-api-key"
    ) {
      return apiKey;
    }

    if (typeof auth === "function") {
      return auth(security);
    }

    return auth;
  };
};

const toConfig = (options: BoboddyClientOptions = {}): Config<ClientOptions> => {
  const { apiKey, auth, ...config } = options;

  return {
    ...config,
    auth: resolveAuth(apiKey, auth),
  };
};

export const createClient = (options: BoboddyClientOptions = {}) =>
  new BoboddyClient({
    client: createGeneratedClient(toConfig(options)),
  });

export const configureClient = (
  options: BoboddyClientOptions = {},
): Config<ClientOptions> => defaultClient.setConfig(toConfig(options));

export const client = new BoboddyClient({
  client: defaultClient,
});
