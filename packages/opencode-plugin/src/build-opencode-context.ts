import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "@opencode-ai/sdk";
import type { OpenCodeMcpServers } from "@boboddy/sdk/opencode-mcp";
import { parseJsonc } from "@boboddy/sdk/jsonc";
import { buildStepExecutionOpencodeConfig } from "./build-step-execution-opencode-config";
import embeddedOpencodeJsonc from "../opencode.jsonc" with { type: "text" };

const NPM_PACKAGE_NAME = "@boboddy/opencode-plugin";

// When running as a compiled binary, import.meta.url resolves to the binary
// path rather than the source file, breaking relative path resolution.
// BOBODDY_PLUGIN_BUNDLE_PATH lets callers point directly at the built bundle
// (e.g. /repo/packages/ai/opencode/dist/plugin.js), from which the package
// root — and therefore opencode.jsonc, opencodeignore.txt, etc. — can be
// derived without import.meta.url.
function resolvePackageRoot(): string {
  const sourcePackageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const envBundlePath = process.env["BOBODDY_PLUGIN_BUNDLE_PATH"];
  if (envBundlePath) {
    const derivedPackageRoot = path.resolve(path.dirname(envBundlePath), "..");
    if (existsSync(path.join(derivedPackageRoot, "package.json"))) {
      return derivedPackageRoot;
    }
  }
  return sourcePackageRoot;
}

function parseJsoncConfig(content: string): Config {
  return parseJsonc(content) as Config;
}

async function deployDevPlugin(
  targetRoot: string,
  packageRoot: string,
): Promise<void> {
  const pluginsDir = path.join(targetRoot, "plugins");
  await mkdir(pluginsDir, { recursive: true });

  const bundlePath =
    process.env["BOBODDY_PLUGIN_BUNDLE_PATH"] ??
    path.join(packageRoot, "dist", "plugin.js");

  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const pluginSdkVersion =
    packageJson.dependencies?.["@opencode-ai/plugin"] ?? "*";

  await Promise.all([
    cp(bundlePath, path.join(pluginsDir, "boboddy.js"), { force: true }),
    writeFile(
      path.join(targetRoot, "package.json"),
      `${JSON.stringify(
        {
          name: "@boboddy/opencode-plugin-runtime",
          private: true,
          type: "module",
          dependencies: {
            "@opencode-ai/plugin": pluginSdkVersion,
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    ),
    cp(
      path.join(packageRoot, "opencodeignore.txt"),
      path.join(targetRoot, ".gitignore"),
      { force: true },
    ),
  ]);
}

export async function buildOpencodeContext(input: {
  workspacePath: string;
  stepMcpServers?: OpenCodeMcpServers | null | undefined;
}): Promise<void> {
  const targetRoot = path.join(input.workspacePath, ".opencode");
  const targetConfigPath = path.join(input.workspacePath, "opencode.jsonc");
  const packageRoot = resolvePackageRoot();

  const baselineConfig = JSON.parse(
    JSON.stringify(parseJsoncConfig(embeddedOpencodeJsonc as string)),
  ) as Config;

  if (process.env["BOBODDY_PLUGIN_DEV"] === "true") {
    await mkdir(targetRoot, { recursive: true });
    await deployDevPlugin(targetRoot, packageRoot);
  } else {
    (baselineConfig as Record<string, unknown>)["plugin"] = [NPM_PACKAGE_NAME];
  }

  const mergedConfig = buildStepExecutionOpencodeConfig({
    baseConfig: baselineConfig,
    stepMcpServers: input.stepMcpServers,
  });
  await writeFile(
    targetConfigPath,
    `${JSON.stringify(mergedConfig, null, 2)}\n`,
    "utf8",
  );
}
