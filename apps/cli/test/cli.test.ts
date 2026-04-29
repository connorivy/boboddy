import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { concurrentTest } from "./utils";

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
  concurrentTest("prints the default hello greeting", () => {
    const result = run([process.execPath, "run", cliEntrypoint, "hello"]);

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "Hello, world!\n",
      stderr: "",
    });
  });

  concurrentTest("prints a named hello greeting", () => {
    const result = run([
      process.execPath,
      "run",
      cliEntrypoint,
      "hello",
      "Connor",
    ]);

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "Hello, Connor!\n",
      stderr: "",
    });
  });

  concurrentTest("prints help output", () => {
    const result = run([process.execPath, "run", cliEntrypoint, "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("hello [name]");
    expect(result.stdout).toContain("work <projectId>");
    expect(result.stdout).toContain("--help");
    expect(result.stdout).toContain("--version");
  });

  concurrentTest("prints version output", () => {
    const result = run([process.execPath, "run", cliEntrypoint, "--version"]);

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "0.0.0\n",
      stderr: "",
    });
  });

  concurrentTest("reports a missing compiled binary in the wrapper", () => {
    const result = run(["node", wrapperEntrypoint, "hello"], {
      BOBODDY_DIST_DIR: resolve(projectRoot, "dist-does-not-exist"),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Missing compiled binary");
  });

  concurrentTest("reports an unsupported platform in the wrapper", () => {
    const result = run(["node", wrapperEntrypoint, "hello"], {
      BOBODDY_PLATFORM: "freebsd",
      BOBODDY_ARCH: "arm64",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unsupported platform or architecture");
  });

  concurrentTest("reports auth status when not signed in", () => {
    const fakeHome = mkdtempSync(resolve(tmpdir(), "boboddy-cli-"));

    try {
      const result = run(
        [
          process.execPath,
          "run",
          cliEntrypoint,
          "auth",
          "status",
          "--base-url",
          "https://example.com",
        ],
        { HOME: fakeHome },
      );

      expect(result).toMatchObject({
        exitCode: 0,
        stdout: "Not signed in to https://example.com.\n",
        stderr: "",
      });
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test.concurrent("prints whoami error when auth is missing", () => {
    const fakeHome = mkdtempSync(resolve(tmpdir(), "boboddy-cli-"));

    try {
      const result = run(
        [
          process.execPath,
          "run",
          cliEntrypoint,
          "auth",
          "whoami",
          "--base-url",
          "https://example.com",
        ],
        { HOME: fakeHome },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Not signed in to https://example.com.");
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test.concurrent("removes stored auth data on logout", () => {
    const fakeHome = mkdtempSync(resolve(tmpdir(), "boboddy-cli-"));
    const authFile = resolve(fakeHome, ".boboddy");

    try {
      writeFileSync(
        authFile,
        `${JSON.stringify({
          profiles: {
            "https://example.com": {
              accessToken: "token-123",
              email: "user@example.com",
            },
          },
        })}\n`,
        "utf8",
      );

      const result = run(
        [
          process.execPath,
          "run",
          cliEntrypoint,
          "auth",
          "logout",
          "--base-url",
          "https://example.com",
        ],
        { HOME: fakeHome },
      );

      expect(result).toMatchObject({
        exitCode: 0,
        stdout: "Signed out from https://example.com.\n",
        stderr: "",
      });

      const statusResult = run(
        [
          process.execPath,
          "run",
          cliEntrypoint,
          "auth",
          "status",
          "--base-url",
          "https://example.com",
        ],
        { HOME: fakeHome },
      );

      expect(statusResult.stdout).toBe(
        "Not signed in to https://example.com.\n",
      );
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
