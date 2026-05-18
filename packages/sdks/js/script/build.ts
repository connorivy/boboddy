import { cp, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const distDir = resolve(projectRoot, "dist");

await rm(distDir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [
    resolve(projectRoot, "src/index.ts"),
    resolve(projectRoot, "src/client.ts"),
    resolve(projectRoot, "src/define-step.ts"),
    resolve(projectRoot, "src/step-definitions-client.ts"),
    resolve(projectRoot, "src/opencode-mcp.ts"),
    resolve(projectRoot, "src/jsonc.ts"),
    resolve(projectRoot, "src/boboddy-config-parser.ts"),
  ],
  outdir: distDir,
  format: "esm",
  target: "browser",
  external: ["@elysiajs/eden", "elysia"],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const tsc = Bun.spawnSync(
  ["bunx", "tsc", "--project", resolve(projectRoot, "tsconfig.build.json")],
  { stdio: ["inherit", "inherit", "inherit"] },
);

if (tsc.exitCode !== 0) process.exit(tsc.exitCode);

// tsc outputs nested paths (e.g. dist/packages/sdks/js/src/foo.d.ts) because the
// monorepo tsconfig pulls in files from outside this package. Flatten to dist/.
const nestedSrcDir = resolve(distDir, "packages/sdks/js/src");
const entries = await readdir(nestedSrcDir).catch(() => []);
for (const entry of entries) {
  await cp(resolve(nestedSrcDir, entry), resolve(distDir, entry), {
    recursive: true,
  });
}
// Remove the monorepo-structure directories left behind by tsc
for (const dir of ["packages", "apps"]) {
  await rm(resolve(distDir, dir), { recursive: true, force: true });
}
