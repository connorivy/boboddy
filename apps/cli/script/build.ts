import { mkdir, rm, writeFile } from "node:fs/promises";
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

const platformTargetMap: Record<string, string> = {
  "darwin:arm64": "bun-darwin-arm64",
  "darwin:x64": "bun-darwin-x64",
  "linux:arm64": "bun-linux-arm64",
  "linux:x64": "bun-linux-x64",
  "win32:x64": "bun-windows-x64",
};

const binaryNameMap: Record<string, string> = {
  "darwin:arm64": `${CLI_NAME}-darwin-arm64`,
  "darwin:x64": `${CLI_NAME}-darwin-x64`,
  "linux:arm64": `${CLI_NAME}-linux-arm64`,
  "linux:x64": `${CLI_NAME}-linux-x64`,
  "win32:x64": `${CLI_NAME}-windows-x64.exe`,
};

const allTargets: readonly BuildTarget[] = [
  { bunTarget: "bun-darwin-arm64", outputName: `${CLI_NAME}-darwin-arm64`, codesign: true },
  { bunTarget: "bun-darwin-x64", outputName: `${CLI_NAME}-darwin-x64`, codesign: true },
  { bunTarget: "bun-linux-x64", outputName: `${CLI_NAME}-linux-x64` },
  { bunTarget: "bun-linux-arm64", outputName: `${CLI_NAME}-linux-arm64` },
  { bunTarget: "bun-windows-x64", outputName: `${CLI_NAME}-windows-x64.exe` },
];

async function buildTarget(
  target: BuildTarget,
  extraDefines: readonly string[] = [],
): Promise<void> {
  const outfile = resolve(distDirectory, target.outputName);
  const subprocess = Bun.spawn(
    [
      process.execPath,
      "build",
      entrypoint,
      "--compile",
      `--target=${target.bunTarget}`,
      `--outfile=${outfile}`,
      ...extraDefines,
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
    // CI signs darwin binaries in the sign-cli-macos workflow job instead.
    // This branch only runs for local macOS builds.
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
  const isDev = process.argv.includes("--dev");

  await rm(distDirectory, { recursive: true, force: true });
  await mkdir(distDirectory, { recursive: true });

  if (isDev) {
    const hostKey = `${process.platform}:${process.arch}`;
    const hostBunTarget = platformTargetMap[hostKey];
    const hostOutputName = binaryNameMap[hostKey];
    const sdkProjectRoot = resolve(projectRoot, "../../packages/sdks/js");

    if (!hostBunTarget || !hostOutputName) {
      throw new Error(`Unsupported platform/arch: ${hostKey}`);
    }

    const sdkPackageBuild = Bun.spawnSync(
      [process.execPath, "run", "script/package-artifact.ts"],
      {
        cwd: sdkProjectRoot,
        stdout: "pipe",
        stderr: "inherit",
      },
    );
    if (sdkPackageBuild.exitCode !== 0) {
      throw new Error("Failed to create dev SDK package artifact.");
    }
    const devSdkPackagePath = sdkPackageBuild.stdout.toString().trim();
    if (!devSdkPackagePath) {
      throw new Error("Dev SDK package artifact path was empty.");
    }

    const defines = [
      "--define",
      `process.env.BOBODDY_BASE_URL=${JSON.stringify("http://localhost:3000")}`,
      "--define",
      `process.env.BOBODDY_DEV_SDK_PATH=${JSON.stringify(devSdkPackagePath)}`,
    ];
    const targets: BuildTarget[] = [{ bunTarget: hostBunTarget, outputName: hostOutputName, codesign: true }];

    // Always include Linux binaries — they're injected into the devcontainer at runtime.
    if (process.platform !== "linux") {
      targets.push(
        { bunTarget: "bun-linux-arm64", outputName: `${CLI_NAME}-linux-arm64` },
        { bunTarget: "bun-linux-x64", outputName: `${CLI_NAME}-linux-x64` },
      );
    }

    for (const target of targets) {
      process.stdout.write(`Building dev binary ${target.outputName}...\n`);
      await buildTarget(target, defines);
    }

    // Marker so bin/boboddy knows to inject plugin dev env vars at runtime.
    await writeFile(resolve(distDirectory, ".dev"), "", "utf8");

    process.stdout.write(`Dev build complete: ${resolve(distDirectory, hostOutputName)}\n`);
  } else {
    for (const target of allTargets) {
      process.stdout.write(`Building ${target.outputName}...\n`);
      await buildTarget(target);
    }
  }
}

await main();
