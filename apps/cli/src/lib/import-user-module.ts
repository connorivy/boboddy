import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";

type PackageJson = {
  exports?: string | Record<string, unknown>;
  main?: string;
};

function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") &&
    !specifier.startsWith("/") &&
    !specifier.startsWith("file:") &&
    !specifier.startsWith("node:") &&
    !specifier.startsWith("bun:");
}

function resolvePackageDirectory(specifier: string, importerPath: string): {
  packageDir: string;
  subpath: string;
} {
  const segments = specifier.split("/");
  const packageName = specifier.startsWith("@")
    ? `${segments[0]}/${segments[1] ?? ""}`
    : (segments[0] ?? "");
  const subpathSegments = specifier.startsWith("@") ? segments.slice(2) : segments.slice(1);
  let currentDir = dirname(importerPath);

  while (true) {
    const packageDir = join(currentDir, "node_modules", packageName);
    if (existsSync(packageDir)) {
      return { packageDir, subpath: subpathSegments.join("/") };
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Cannot find module '${specifier}' from '${importerPath}'`);
    }
    currentDir = parentDir;
  }
}

function resolveExportTarget(exportsField: PackageJson["exports"], subpath: string): string | null {
  if (!exportsField) {
    return null;
  }

  if (typeof exportsField === "string") {
    return subpath.length === 0 ? exportsField : null;
  }

  const key = subpath.length === 0 ? "." : `./${subpath}`;
  const entry = exportsField[key];
  if (typeof entry === "string") {
    return entry;
  }
  if (entry && typeof entry === "object") {
    const record = entry as Record<string, unknown>;
    for (const condition of ["bun", "import", "default", "require"] as const) {
      const target = record[condition];
      if (typeof target === "string") {
        return target;
      }
    }
  }

  return null;
}

function resolveSpecifier(specifier: string, importerPath: string): string {
  if (!isBareSpecifier(specifier)) {
    return specifier;
  }

  // Normalize "node_modules/foo/..." → "foo/..." (IDE auto-import artifact)
  if (specifier.startsWith("node_modules/")) {
    specifier = specifier.slice("node_modules/".length);
  }

  const { packageDir, subpath } = resolvePackageDirectory(specifier, importerPath);
  const packageJson = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  ) as PackageJson;
  let exportTarget = resolveExportTarget(packageJson.exports, subpath);

  // When the user imports via a dist/ path (e.g. from IDE auto-import), strip "dist/" and
  // walk up the subpath to find the containing package export.
  if (exportTarget === null && subpath.startsWith("dist/")) {
    let candidate = subpath.slice(5); // strip "dist/"
    while (candidate.length > 0 && exportTarget === null) {
      exportTarget = resolveExportTarget(packageJson.exports, candidate);
      const lastSlash = candidate.lastIndexOf("/");
      candidate = lastSlash > 0 ? candidate.slice(0, lastSlash) : "";
    }
  }

  const resolvedPath = exportTarget
    ? join(packageDir, exportTarget)
    : join(packageDir, packageJson.main ?? (subpath.length > 0 ? subpath : "index.js"));

  return pathToFileURL(resolvedPath).href;
}

function rewriteImports(source: string, importerPath: string): string {
  return source
    .replace(/\bfrom\s+(['"])([^'"]+)\1/g, (full, quote: string, specifier: string) => {
      return `from ${quote}${resolveSpecifier(specifier, importerPath)}${quote}`;
    })
    .replace(/\bimport\s+(['"])([^'"]+)\1/g, (full, quote: string, specifier: string) => {
      return `import ${quote}${resolveSpecifier(specifier, importerPath)}${quote}`;
    })
    .replace(/\bimport\(\s*(['"])([^'"]+)\1\s*\)/g, (full, quote: string, specifier: string) => {
      return `import(${quote}${resolveSpecifier(specifier, importerPath)}${quote})`;
    });
}

export async function importUserModule(absPath: string): Promise<unknown> {
  const source = readFileSync(absPath, "utf8");
  const rewritten = rewriteImports(source, absPath);

  if (rewritten === source) {
    return import(pathToFileURL(absPath).href);
  }

  const ext = extname(absPath);
  const tempPath = join(
    dirname(absPath),
    `.${basename(absPath, ext)}.boboddy-load-${randomUUID()}${ext || ".js"}`,
  );

  writeFileSync(tempPath, rewritten, "utf8");

  try {
    return await import(pathToFileURL(tempPath).href);
  } finally {
    rmSync(tempPath, { force: true });
  }
}
