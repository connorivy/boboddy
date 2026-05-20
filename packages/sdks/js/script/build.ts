#!/usr/bin/env bun

import { $ } from "bun";
import { cp, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
process.chdir(projectRoot);

const distDir = resolve(projectRoot, "dist");
const pkg = (await Bun.file(resolve(projectRoot, "package.json")).json()) as {
  exports: Record<string, string>;
};

const entrypoints = [
  ...new Set(
    Object.values(pkg.exports).map((value) => resolve(projectRoot, value)),
  ),
];

await $`rm -rf dist`;

const result = await Bun.build({
  entrypoints,
  outdir: distDir,
  format: "esm",
  target: "browser",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

await $`bunx tsc --project tsconfig.build.json`;

// Flatten tsc output after monorepo path resolution widens rootDir.
const nestedSrcDir = resolve(distDir, "packages/sdks/js/src");
for (const entry of await readdir(nestedSrcDir).catch(() => [])) {
  await cp(resolve(nestedSrcDir, entry), resolve(distDir, entry), {
    recursive: true,
  });
}

for (const dir of ["packages", "apps"]) {
  await rm(resolve(distDir, dir), { recursive: true, force: true });
}
