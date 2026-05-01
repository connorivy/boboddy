import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

interface BuildTarget {
  readonly bunTarget: string;
  readonly outputName: string;
}

const RUNTIME_PROXY_NAME = "boboddy-runtime-proxy";
const projectRoot = resolve(import.meta.dir, "..");
const distDirectory = resolve(projectRoot, "dist");
const entrypoint = resolve(projectRoot, "src/index.ts");

const buildTargets: readonly BuildTarget[] = [
  {
    bunTarget: "bun-linux-x64",
    outputName: `${RUNTIME_PROXY_NAME}-linux-x64`,
  },
  {
    bunTarget: "bun-linux-arm64",
    outputName: `${RUNTIME_PROXY_NAME}-linux-arm64`,
  },
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
    process.stdout.write(`Building ${target.outputName}...\n`);
    await buildTarget(target);
  }
}

await main();
