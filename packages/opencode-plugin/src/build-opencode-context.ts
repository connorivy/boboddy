import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_OPENCODE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const RUNTIME_BOBODDY_SOURCE_ROOT = "/workspace/.boboddy-src";

function rewriteRuntimeImports(source: string): string {
  return source
    .replaceAll("'#boboddy/", `'${RUNTIME_BOBODDY_SOURCE_ROOT}/packages/boboddy/src/`)
    .replaceAll('"#boboddy/', `"${RUNTIME_BOBODDY_SOURCE_ROOT}/packages/boboddy/src/`);
}

async function buildRuntimePackageJson(): Promise<string> {
  const sourcePackageJsonPath = path.join(SOURCE_OPENCODE_DIR, "package.json");
  const sourcePackageJson = JSON.parse(
    await readFile(sourcePackageJsonPath, "utf8"),
  ) as {
    dependencies?: Record<string, string>;
  };

  return `${JSON.stringify(
    {
      ...sourcePackageJson,
      dependencies: sourcePackageJson.dependencies ?? {},
    },
    null,
    2,
  )}\n`;
}

export async function buildOpencodeContext(input: {
  workspacePath: string;
}): Promise<void> {
  const targetRoot = path.join(input.workspacePath, ".opencode");
  const sourceToolsDir = path.join(SOURCE_OPENCODE_DIR, "tools");
  const targetToolsDir = path.join(targetRoot, "tools");

  await mkdir(targetRoot, { recursive: true });
  await mkdir(targetToolsDir, { recursive: true });

  const runtimePackageJson = await buildRuntimePackageJson();

  await Promise.all([
    cp(
      path.join(SOURCE_OPENCODE_DIR, "opencode.jsonc"),
      path.join(input.workspacePath, "opencode.jsonc"),
      {
        recursive: true,
        force: true,
      },
    ),
    cp(sourceToolsDir, targetToolsDir, {
      recursive: true,
      force: true,
    }),
    cp(path.join(SOURCE_OPENCODE_DIR, "opencodeignore.txt"), path.join(targetRoot, ".gitignore"), {
      force: true,
    }),
    writeFile(path.join(targetRoot, "package.json"), runtimePackageJson, "utf8"),
  ]);

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
