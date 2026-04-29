import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const cliEntrypoint = resolve(projectRoot, "src/index.ts");
const wrapperEntrypoint = resolve(projectRoot, "bin/boboddy");

interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function run(command: readonly string[], env?: NodeJS.ProcessEnv): SpawnResult {
  const [file, ...args] = command;

  if (file === undefined) {
    throw new Error("A command is required.");
  }

  const result = spawnSync(file, args, {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

describe("boboddy CLI", () => {
  test.concurrent("prints the default hello greeting", () => {
    const result = run([process.execPath, "run", cliEntrypoint, "hello"]);

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "Hello, world!\n",
      stderr: "",
    });
  });

  test.concurrent("prints a named hello greeting", () => {
    const result = run([process.execPath, "run", cliEntrypoint, "hello", "Connor"]);

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "Hello, Connor!\n",
      stderr: "",
    });
  });

  test.concurrent("prints help output", () => {
    const result = run([process.execPath, "run", cliEntrypoint, "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("hello [name]");
    expect(result.stdout).toContain("--help");
    expect(result.stdout).toContain("--version");
  });

  test.concurrent("prints version output", () => {
    const result = run([process.execPath, "run", cliEntrypoint, "--version"]);

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "0.0.0\n",
      stderr: "",
    });
  });

  test.concurrent("reports a missing compiled binary in the wrapper", () => {
    const result = run(["node", wrapperEntrypoint, "hello"], {
      BOBODDY_DIST_DIR: resolve(projectRoot, "dist-does-not-exist"),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Missing compiled binary");
  });

  test.concurrent("reports an unsupported platform in the wrapper", () => {
    const result = run(["node", wrapperEntrypoint, "hello"], {
      BOBODDY_PLATFORM: "freebsd",
      BOBODDY_ARCH: "arm64",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unsupported platform or architecture");
  });
});
