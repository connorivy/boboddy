import { cp, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const distDir = resolve(projectRoot, "dist");

// Remove stale top-level declarations before rebuilding
for (const entry of await readdir(distDir).catch(() => [])) {
  if (entry.endsWith(".d.ts")) {
    await rm(resolve(distDir, entry), { force: true });
  }
}

const tsc = Bun.spawnSync(
  ["bunx", "tsc", "--project", resolve(projectRoot, "tsconfig.build.json")],
  { stdio: ["inherit", "inherit", "inherit"] },
);
if (tsc.exitCode !== 0) process.exit(tsc.exitCode);

// tsc outputs to dist/packages/sdks/js/src/ because the monorepo tsconfig pulls
// in cross-package path aliases, widening rootDir to the repo root. Flatten back.
const nestedSrcDir = resolve(distDir, "packages/sdks/js/src");
for (const entry of await readdir(nestedSrcDir).catch(() => [])) {
  await cp(resolve(nestedSrcDir, entry), resolve(distDir, entry), { recursive: true });
}
for (const dir of ["packages", "apps"]) {
  await rm(resolve(distDir, dir), { recursive: true, force: true });
}
