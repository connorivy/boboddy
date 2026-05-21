import { access, readFile } from "node:fs/promises";
import path from "node:path";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export interface RepoAnalysis {
  kind: "web_app" | "unknown";
  framework: "nextjs" | "vite" | "react" | null;
  hasPlaywright: boolean;
  confidence: "high" | "low";
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function anyPathExists(paths: readonly string[]): Promise<boolean> {
  for (const filePath of paths) {
    if (await pathExists(filePath)) {
      return true;
    }
  }

  return false;
}

async function readPackageJson(rootDir: string): Promise<PackageJson | null> {
  try {
    const content = await readFile(path.join(rootDir, "package.json"), "utf8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

const hasDependency = (
  packageJson: PackageJson | null,
  dependencyName: string,
): boolean => {
  if (!packageJson) {
    return false;
  }

  return Boolean(
    packageJson.dependencies?.[dependencyName] ??
      packageJson.devDependencies?.[dependencyName],
  );
};

export async function analyzeRepo(rootDir = process.cwd()): Promise<RepoAnalysis> {
  const packageJson = await readPackageJson(rootDir);
  const [
    hasNextConfig,
    hasViteConfig,
    hasPlaywrightConfig,
    hasAppDir,
    hasSrcAppDir,
    hasPagesDir,
    hasSrcDir,
  ] = await Promise.all([
    anyPathExists([
      path.join(rootDir, "next.config.js"),
      path.join(rootDir, "next.config.mjs"),
      path.join(rootDir, "next.config.ts"),
    ]),
    anyPathExists([
      path.join(rootDir, "vite.config.js"),
      path.join(rootDir, "vite.config.mjs"),
      path.join(rootDir, "vite.config.ts"),
    ]),
    anyPathExists([
      path.join(rootDir, "playwright.config.ts"),
      path.join(rootDir, "playwright.config.js"),
      path.join(rootDir, "playwright.config.mjs"),
    ]),
    anyPathExists([
      path.join(rootDir, "app", "layout.tsx"),
      path.join(rootDir, "app", "page.tsx"),
    ]),
    anyPathExists([
      path.join(rootDir, "src", "app", "layout.tsx"),
      path.join(rootDir, "src", "app", "page.tsx"),
    ]),
    anyPathExists([
      path.join(rootDir, "pages", "index.tsx"),
      path.join(rootDir, "pages", "_app.tsx"),
    ]),
    pathExists(path.join(rootDir, "src")),
  ]);

  const hasNext = hasNextConfig || hasDependency(packageJson, "next");
  const hasVite = hasViteConfig || hasDependency(packageJson, "vite");
  const hasReact = hasDependency(packageJson, "react");
  const hasPlaywright =
    hasPlaywrightConfig || hasDependency(packageJson, "@playwright/test");

  if (hasNext) {
    return {
      kind: "web_app",
      framework: "nextjs",
      hasPlaywright,
      confidence: "high",
    };
  }

  if (hasVite && hasReact) {
    return {
      kind: "web_app",
      framework: "vite",
      hasPlaywright,
      confidence: "high",
    };
  }

  if (hasReact && (hasAppDir || hasSrcAppDir || hasPagesDir || hasSrcDir)) {
    return {
      kind: "web_app",
      framework: "react",
      hasPlaywright,
      confidence: "low",
    };
  }

  return {
    kind: "unknown",
    framework: null,
    hasPlaywright,
    confidence: "low",
  };
}
