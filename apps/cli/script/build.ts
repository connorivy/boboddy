import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

interface BuildTarget {
  readonly bunTarget: string;
  readonly outputName: string;
}

const CLI_NAME = "boboddy";
const projectRoot = resolve(import.meta.dir, "..");
const distDirectory = resolve(projectRoot, "dist");
const entrypoint = resolve(projectRoot, "src/index.ts");

const buildTargets: readonly BuildTarget[] = [
  { bunTarget: "bun-darwin-arm64", outputName: `${CLI_NAME}-darwin-arm64` },
  { bunTarget: "bun-darwin-x64", outputName: `${CLI_NAME}-darwin-x64` },
  { bunTarget: "bun-linux-x64", outputName: `${CLI_NAME}-linux-x64` },
  { bunTarget: "bun-linux-arm64", outputName: `${CLI_NAME}-linux-arm64` },
  { bunTarget: "bun-windows-x64", outputName: `${CLI_NAME}-windows-x64.exe` },
];

async function buildTarget(target: BuildTarget): Promise<void> {
  const outfile = resolve(distDirectory, target.outputName);
  const subprocess = Bun.spawn(
    [
      process.execPath,
      "build",
      entrypoint,
      "--compile",
      `--target=${target.bunTarget}`,
      `--outfile=${outfile}`,
    ],
    {
      cwd: projectRoot,
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  const exitCode = await subprocess.exited;

  if (exitCode !== 0) {
    throw new Error(`Build failed for ${target.bunTarget}.`);
  }
}

async function main(): Promise<void> {
  await rm(distDirectory, { recursive: true, force: true });
  await mkdir(distDirectory, { recursive: true });

  for (const target of buildTargets) {
    console.log(`Building ${target.outputName}...`);
    await buildTarget(target);
  }
}

await main();
