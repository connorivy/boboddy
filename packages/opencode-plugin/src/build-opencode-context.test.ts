import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { buildOpencodeContext } from "./build-opencode-context";

describe("buildOpencodeContext", () => {
  test.concurrent(
    "writes a runtime package with only runtime-safe tool dependencies",
    async () => {
      const workspacePath = await mkdtemp(
        path.join(os.tmpdir(), "build-opencode-context-test-"),
      );

      await buildOpencodeContext({
        workspacePath,
        stepMcpServers: null,
      });

      const runtimePackageJson = JSON.parse(
        await readFile(
          path.join(workspacePath, ".opencode", "package.json"),
          "utf8",
        ),
      ) as {
        dependencies?: Record<string, string>;
      };

      expect(runtimePackageJson.dependencies).toEqual({
        "@opencode-ai/plugin": "1.14.34",
        ajv: "^8.17.1",
      });
      expect(runtimePackageJson.dependencies).not.toHaveProperty(
        "@boboddy/core",
      );
    },
  );
});
