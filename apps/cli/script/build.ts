import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

interface BuildTarget {
  readonly bunTarget: string;
  readonly outputName: string;
  readonly codesign?: boolean;
}

const CLI_NAME = "boboddy";
const projectRoot = resolve(import.meta.dir, "..");
const distDirectory = resolve(projectRoot, "dist");
const entrypoint = resolve(projectRoot, "src/index.ts");

const buildTargets: readonly BuildTarget[] = [
  { bunTarget: "bun-darwin-arm64", outputName: `${CLI_NAME}-darwin-arm64`, codesign: true },
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

  if (target.codesign && process.platform === "darwin") {
    process.stdout.write(`Signing ${target.outputName}...\n`);
    // Bun --compile embeds the JS bundle after the initial binary signature,
    // leaving an invalid LC_CODE_SIGNATURE. Strip it before re-signing.
    const stripProc = Bun.spawn(["codesign", "--remove-signature", outfile], {
      stdout: "inherit",
      stderr: "inherit",
    });
    await stripProc.exited;
    const signProc = Bun.spawn(["codesign", "--sign", "-", "--force", outfile], {
      stdout: "inherit",
      stderr: "inherit",
    });
    const signExit = await signProc.exited;
    if (signExit !== 0) {
      throw new Error(`codesign failed for ${target.outputName}.`);
    }
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
