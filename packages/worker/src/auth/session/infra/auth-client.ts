import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

export const createCliAuthClient = ({
  baseUrl,
  accessToken,
}: {
  baseUrl: string;
  accessToken?: string;
}) =>
  createAuthClient({
    baseURL: baseUrl,
    basePath: "/api/auth",
    plugins: [deviceAuthorizationClient()],
    fetchOptions: accessToken
      ? {
          auth: {
            type: "Bearer",
            token: accessToken,
          },
        }
      : undefined,
  });
