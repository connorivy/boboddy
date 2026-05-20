#!/usr/bin/env bun

import { $ } from "bun";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
process.chdir(projectRoot);

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version`.nothrow()).exitCode === 0;
}

function transformExports(exports: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(exports).map(([key, value]): [string, unknown] => {
      if (typeof value === "string") {
        const file = value.replace("./src/", "./dist/").replace(/\.ts$/u, "");
        return [key, { import: `${file}.js`, types: `${file}.d.ts` }];
      }

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return [key, transformExports(value as Record<string, unknown>)];
      }

      return [key, value];
    }),
  );
}

const tag = process.argv[2] ?? "latest";
const originalText = await Bun.file("package.json").text();
const pkg = JSON.parse(originalText) as {
  name: string;
  version: string;
  exports: Record<string, unknown>;
};

if (await published(pkg.name, pkg.version)) {
  console.log(`already published ${pkg.name}@${pkg.version}`);
} else {
  pkg.exports = transformExports(pkg.exports);
  await Bun.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

  try {
    await $`bun run build`;
    await $`bun pm pack`;
    await $`npm publish *.tgz --tag ${tag} --access public`;
  } finally {
    await Bun.write("package.json", originalText);
  }
}
