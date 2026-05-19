import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

type SdkPackageJson = {
  name: string;
  version: string;
  type?: string;
  exports?: Record<string, unknown>;
  publishConfig?: {
    exports?: Record<string, unknown>;
  };
  peerDependencies?: Record<string, string>;
};

const projectRoot = resolve(import.meta.dir, "..");
const distDir = resolve(projectRoot, "dist");
const artifactDir = resolve(projectRoot, ".artifacts");
const packageDir = resolve(artifactDir, "package");
const outputTarball = resolve(artifactDir, "boboddy-sdk-dev.tgz");

function run(command: string[], cwd: string): void {
  const proc = Bun.spawnSync(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (proc.exitCode !== 0) {
    process.exit(proc.exitCode);
  }
}

const sourcePackage = (await Bun.file(resolve(projectRoot, "package.json")).json()) as SdkPackageJson;

await rm(distDir, { recursive: true, force: true });
run([process.execPath, "run", "script/build.ts"], projectRoot);

run([process.execPath, "run", "script/declarations.ts"], projectRoot);

await rm(artifactDir, { recursive: true, force: true });
await mkdir(packageDir, { recursive: true });
await cp(distDir, resolve(packageDir, "dist"), { recursive: true });

const installPackageJson = {
  name: sourcePackage.name,
  version: sourcePackage.version,
  type: sourcePackage.type ?? "module",
  exports: sourcePackage.publishConfig?.exports ?? sourcePackage.exports,
  peerDependencies: sourcePackage.peerDependencies ?? {},
};

await writeFile(
  resolve(packageDir, "package.json"),
  `${JSON.stringify(installPackageJson, null, 2)}\n`,
  "utf8",
);

const pack = Bun.spawnSync(["npm", "pack", "--pack-destination", artifactDir], {
  cwd: packageDir,
  stdout: "pipe",
  stderr: "inherit",
});

if (pack.exitCode !== 0) {
  process.exit(pack.exitCode);
}

const packedName = pack.stdout.toString().trim().split("\n").pop()?.trim();
if (!packedName) {
  throw new Error("npm pack did not produce a tarball name.");
}

const packedTarball = resolve(artifactDir, basename(packedName));
await rm(outputTarball, { force: true });
await rename(packedTarball, outputTarball);

process.stdout.write(`${outputTarball}\n`);
