import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDevcontainerCliCommand,
  resolveDevcontainerCliPackageJsonPath,
} from "../../../../src/runtime/runtime-service/infra/devcontainer-cli-launcher";

describe("devcontainer CLI launcher", () => {
  test.concurrent("invokes the devcontainer package with node", () => {
    expect(
      buildDevcontainerCliCommand("/tmp/devcontainer.js", ["up", "--help"]),
    ).toEqual(["node", "/tmp/devcontainer.js", "up", "--help"]);
  });

  test.concurrent("resolves @devcontainers/cli from an explicit package root", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "boboddy-devcontainer-cli-"));

    try {
      const packageRoot = join(tempDir, "cli");
      const dependencyDir = join(
        packageRoot,
        "node_modules",
        "@devcontainers",
        "cli",
      );

      mkdirSync(dependencyDir, { recursive: true });
      writeFileSync(
        join(packageRoot, "package.json"),
        `${JSON.stringify({ name: "test-cli" })}\n`,
        "utf8",
      );
      writeFileSync(
        join(dependencyDir, "package.json"),
        `${JSON.stringify({ name: "@devcontainers/cli", bin: "devcontainer.js" })}\n`,
        "utf8",
      );

      expect(
        resolveDevcontainerCliPackageJsonPath([
          join(tempDir, "missing", "package.json"),
          join(packageRoot, "package.json"),
        ]),
      ).toEndWith("/cli/node_modules/@devcontainers/cli/package.json");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
