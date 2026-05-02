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

interface LogLine {
  readonly level?: number;
  readonly msg?: string;
  readonly [key: string]: unknown;
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

function parseLogLines(stdout: string): LogLine[] {
  return stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as LogLine);
}

describe("boboddy CLI", () => {
  concurrentTest("prints the default hello greeting", () => {
    const result = run([process.execPath, "run", cliEntrypoint, "hello"]);
    const logs = parseLogLines(result.stdout);

    expect(result).toMatchObject({
      exitCode: 0,
      stderr: "",
    });
    expect(logs).toContainEqual(
      expect.objectContaining({ msg: "Hello, world!" }),
    );
  });

  concurrentTest("prints a named hello greeting", () => {
    const result = run([
      process.execPath,
      "run",
      cliEntrypoint,
      "hello",
      "Connor",
    ]);
    const logs = parseLogLines(result.stdout);

    expect(result).toMatchObject({
      exitCode: 0,
      stderr: "",
    });
    expect(logs).toContainEqual(
      expect.objectContaining({ msg: "Hello, Connor!" }),
    );
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
    expect(result.stderr).toBe("");
    expect(parseLogLines(result.stdout)).toContainEqual(
      expect.objectContaining({ msg: "CLI wrapper failed" }),
    );
  });

  concurrentTest("reports an unsupported platform in the wrapper", () => {
    const result = run(["node", wrapperEntrypoint, "hello"], {
      BOBODDY_PLATFORM: "freebsd",
      BOBODDY_ARCH: "arm64",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(parseLogLines(result.stdout)).toContainEqual(
      expect.objectContaining({ msg: "CLI wrapper failed" }),
    );
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
        stderr: "",
      });
      expect(parseLogLines(result.stdout)).toContainEqual(
        expect.objectContaining({ msg: "Not signed in", baseUrl: "https://example.com" }),
      );
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
      expect(result.stderr).toBe("");
      expect(parseLogLines(result.stdout)).toContainEqual(
        expect.objectContaining({ msg: "Not signed in to https://example.com." }),
      );
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
        stderr: "",
      });
      expect(parseLogLines(result.stdout)).toContainEqual(
        expect.objectContaining({ msg: "Signed out", baseUrl: "https://example.com" }),
      );

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

      expect(parseLogLines(statusResult.stdout)).toContainEqual(
        expect.objectContaining({ msg: "Not signed in", baseUrl: "https://example.com" }),
      );
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
