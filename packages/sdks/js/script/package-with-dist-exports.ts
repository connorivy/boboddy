import { resolve } from "node:path";

type PackageJson = {
  exports: Record<string, unknown>;
};

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

export async function withDistExportsPackage<T>(
  projectRoot: string,
  run: () => Promise<T>,
) {
  const packageJsonPath = resolve(projectRoot, "package.json");
  const originalText = await Bun.file(packageJsonPath).text();
  const pkg = JSON.parse(originalText) as PackageJson;

  pkg.exports = transformExports(pkg.exports);
  await Bun.write(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

  try {
    return await run();
  } finally {
    await Bun.write(packageJsonPath, originalText);
  }
}
