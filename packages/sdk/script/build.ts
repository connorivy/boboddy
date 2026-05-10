import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const distDir = resolve(projectRoot, "dist");

await rm(distDir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [resolve(projectRoot, "src/index.ts")],
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

process.exit(tsc.exitCode);
