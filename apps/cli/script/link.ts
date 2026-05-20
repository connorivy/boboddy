import { rm, mkdir, symlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const projectRoot = new URL("..", import.meta.url).pathname.replace(/\/$/u, "");

const npmPrefix = execFileSync("npm", ["prefix", "-g"], {
  encoding: "utf8",
  stdio: ["inherit", "pipe", "inherit"],
}).trim();

const scopeDir = join(npmPrefix, "lib", "node_modules", "@boboddy");
const pkgLink = join(scopeDir, "cli");
const binDir = join(npmPrefix, "bin");
const binLink = join(binDir, "boboddy");

await mkdir(scopeDir, { recursive: true });

await rm(pkgLink, { force: true, recursive: true });
await symlink(projectRoot, pkgLink);

await rm(binLink, { force: true });
// Match npm's relative symlink style: bin/boboddy -> ../lib/node_modules/@boboddy/cli/bin/boboddy
await symlink(relative(binDir, join(pkgLink, "bin", "boboddy")), binLink);

process.stdout.write(`Linked: ${binLink}\n`);
