import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "@opencode-ai/sdk";
import type { OpenCodeMcpServers } from "@boboddy/core/common/contracts/opencode-mcp";
import { parseJsonc } from "@boboddy/core/lib/jsonc";
import { buildStepExecutionOpencodeConfig } from "./build-step-execution-opencode-config";

const SOURCE_OPENCODE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const BOBODDY_CONFIG_PARSER_SOURCE = path.resolve(
  SOURCE_OPENCODE_DIR,
  "../../core/src/agent-sessions/config/domain/boboddy-config-parser.ts",
);

function rewriteRuntimeImports(source: string): string {
  return source;
}

function parseJsoncConfig(content: string): Config {
  return parseJsonc(content) as Config;
}

async function buildRuntimePackageJson(): Promise<string> {
  const sourcePackageJsonPath = path.join(SOURCE_OPENCODE_DIR, "package.json");
  const sourcePackageJson = JSON.parse(
    await readFile(sourcePackageJsonPath, "utf8"),
  ) as {
    name?: string;
    private?: boolean;
    type?: string;
    dependencies?: Record<string, string>;
  };

  const runtimeDependencyNames = ["@opencode-ai/plugin", "ajv"] as const;
  const runtimeDependencies = Object.fromEntries(
    runtimeDependencyNames.flatMap((dependencyName) => {
      const dependencyVersion = sourcePackageJson.dependencies?.[dependencyName];

      if (!dependencyVersion) {
        return [];
      }

      return [[dependencyName, dependencyVersion]];
    }),
  );

  return `${JSON.stringify(
    {
      name: sourcePackageJson.name ?? "opencode-runtime-tools",
      private: sourcePackageJson.private ?? true,
      type: sourcePackageJson.type ?? "module",
      dependencies: runtimeDependencies,
    },
    null,
    2,
  )}\n`;
}

export async function buildOpencodeContext(input: {
  workspacePath: string;
  stepMcpServers?: OpenCodeMcpServers | null | undefined;
}): Promise<void> {
  const targetRoot = path.join(input.workspacePath, ".opencode");
  const sourceToolsDir = path.join(SOURCE_OPENCODE_DIR, "tools");
  const targetToolsDir = path.join(targetRoot, "tools");
  const sourcePluginsDir = path.join(SOURCE_OPENCODE_DIR, "plugins");
  const targetPluginsDir = path.join(targetRoot, "plugins");
  const targetConfigPath = path.join(input.workspacePath, "opencode.jsonc");

  await mkdir(targetRoot, { recursive: true });
  await mkdir(targetToolsDir, { recursive: true });
  await mkdir(targetPluginsDir, { recursive: true });

  const runtimePackageJson = await buildRuntimePackageJson();

  await Promise.all([
    cp(
      path.join(SOURCE_OPENCODE_DIR, "opencode.jsonc"),
      targetConfigPath,
      {
        recursive: true,
        force: true,
      },
    ),
    cp(sourceToolsDir, targetToolsDir, {
      recursive: true,
      force: true,
    }),
    cp(sourcePluginsDir, targetPluginsDir, {
      recursive: true,
      force: true,
    }),
    cp(path.join(SOURCE_OPENCODE_DIR, "opencodeignore.txt"), path.join(targetRoot, ".gitignore"), {
      force: true,
    }),
    writeFile(path.join(targetRoot, "package.json"), runtimePackageJson, "utf8"),
  ]);

  await cp(
    BOBODDY_CONFIG_PARSER_SOURCE,
    path.join(targetToolsDir, "_shared", "boboddy-config-parser.ts"),
    { force: true },
  );

  const toolFiles = await collectTypeScriptFiles(targetToolsDir);
  await Promise.all(
    toolFiles.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      const rewritten = rewriteRuntimeImports(source);

      if (rewritten !== source) {
        await writeFile(filePath, rewritten, "utf8");
      }
    }),
  );

  const baselineConfig = JSON.parse(
    JSON.stringify(parseJsoncConfig(await readFile(targetConfigPath, "utf8"))),
  ) as Config;
  const mergedConfig = buildStepExecutionOpencodeConfig({
    baseConfig: baselineConfig,
    stepMcpServers: input.stepMcpServers,
  });
  await writeFile(targetConfigPath, `${JSON.stringify(mergedConfig, null, 2)}\n`, "utf8");
}

async function collectTypeScriptFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}
