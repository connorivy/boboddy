import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup-vitest.ts"],
    hookTimeout: 120000,
    testTimeout: 120000,
    fileParallelism: false,
    maxWorkers: 1,
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "server-only": new URL("./tests/mocks/server-only.ts", import.meta.url)
        .pathname,
    },
  },
});
