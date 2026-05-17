import { mkdtemp, readFile, access, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import { buildOpencodeContext } from "./build-opencode-context";
describe("buildOpencodeContext (prod mode)", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env["BOBODDY_PLUGIN_DEV"];
    delete process.env["BOBODDY_PLUGIN_DEV"];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["BOBODDY_PLUGIN_DEV"];
    } else {
      process.env["BOBODDY_PLUGIN_DEV"] = originalEnv;
    }
  });

  test("writes opencode.jsonc with npm plugin reference and no .opencode directory", async () => {
    const workspacePath = await mkdtemp(
      path.join(os.tmpdir(), "build-opencode-context-test-"),
    );

    await buildOpencodeContext({ workspacePath, stepMcpServers: null });

    const config = JSON.parse(
      await readFile(path.join(workspacePath, "opencode.jsonc"), "utf8"),
    ) as { plugin?: unknown };

    expect(config.plugin).toEqual(["@boboddy/opencode-plugin"]);

    const dotOpencodeExists = await access(
      path.join(workspacePath, ".opencode"),
    )
      .then(() => true)
      .catch(() => false);
    expect(dotOpencodeExists).toBe(false);
  });
});

describe("buildOpencodeContext (dev mode)", () => {
  let savedDev: string | undefined;
  let savedBundlePath: string | undefined;

  beforeEach(() => {
    savedDev = process.env["BOBODDY_PLUGIN_DEV"];
    savedBundlePath = process.env["BOBODDY_PLUGIN_BUNDLE_PATH"];
    process.env["BOBODDY_PLUGIN_DEV"] = "true";
  });

  afterEach(() => {
    if (savedDev === undefined) {
      delete process.env["BOBODDY_PLUGIN_DEV"];
    } else {
      process.env["BOBODDY_PLUGIN_DEV"] = savedDev;
    }
    if (savedBundlePath === undefined) {
      delete process.env["BOBODDY_PLUGIN_BUNDLE_PATH"];
    } else {
      process.env["BOBODDY_PLUGIN_BUNDLE_PATH"] = savedBundlePath;
    }
  });

  test("copies bundle to .opencode/plugins/ and writes package.json with only plugin sdk dep", async () => {
    const workspacePath = await mkdtemp(
      path.join(os.tmpdir(), "build-opencode-context-test-"),
    );
    const fakeBundlePath = path.join(workspacePath, "fake-plugin.js");
    await writeFile(fakeBundlePath, "export default {};\n", "utf8");
    process.env["BOBODDY_PLUGIN_BUNDLE_PATH"] = fakeBundlePath;

    await buildOpencodeContext({ workspacePath, stepMcpServers: null });

    const runtimePackageJson = JSON.parse(
      await readFile(
        path.join(workspacePath, ".opencode", "package.json"),
        "utf8",
      ),
    ) as { dependencies?: Record<string, string> };

    expect(Object.keys(runtimePackageJson.dependencies ?? {})).toEqual([
      "@opencode-ai/plugin",
    ]);
    expect(runtimePackageJson.dependencies).not.toHaveProperty("@boboddy/core");
    expect(runtimePackageJson.dependencies).not.toHaveProperty("@boboddy/sdk");
    expect(runtimePackageJson.dependencies).not.toHaveProperty("ajv");

    const bundleExists = await access(
      path.join(workspacePath, ".opencode", "plugins", "boboddy.js"),
    )
      .then(() => true)
      .catch(() => false);
    expect(bundleExists).toBe(true);

    const config = JSON.parse(
      await readFile(path.join(workspacePath, "opencode.jsonc"), "utf8"),
    ) as { plugin?: unknown };
    expect(config.plugin).toBeUndefined();
  });
});
