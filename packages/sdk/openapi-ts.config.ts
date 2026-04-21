import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../openapi.json",
  output: "src/client",
  plugins: [
    "@hey-api/typescript",
    {
      name: "@hey-api/sdk",
      operations: {
        containerName: "BoboddyClient",
        nesting: (operation) => {
          const [firstTag] = operation.tags ?? [];
          const group = firstTag
            ? `${firstTag.charAt(0).toLowerCase()}${firstTag.slice(1)}`
            : "api";

          if (operation.operationId === "listEnvironments") {
            return [group, "list"];
          }

          if (operation.operationId === "upsertEnvironment") {
            return [group, "upsert"];
          }

          return [group, operation.operationId ?? operation.method.toLowerCase()];
        },
        strategy: "single",
      },
    },
    "@hey-api/client-fetch",
  ],
});
