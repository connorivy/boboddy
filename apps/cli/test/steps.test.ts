import { describe, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { concurrentTest } from "./utils";

const projectRoot = resolve(import.meta.dir, "..");
const cliEntrypoint = resolve(projectRoot, "src/index.ts");

interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface LogLine {
  readonly msg?: string;
  readonly [key: string]: unknown;
}

function run(
  args: readonly string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): SpawnResult {
  const result = spawnSync(
    process.execPath,
    ["run", cliEntrypoint, ...args],
    {
      cwd: options?.cwd ?? projectRoot,
      env: { ...process.env, ...options?.env },
      encoding: "utf8",
    },
  );

  return {
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    exitCode: result.status ?? 1,
  };
}

function parseLogLines(stdout: string): LogLine[] {
  return stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as LogLine;
      } catch {
        return { msg: line };
      }
    });
}

function hasLogLine(logs: readonly LogLine[], expected: Partial<LogLine>): boolean {
  return logs.some((log) =>
    Object.entries(expected).every(([key, value]) => log[key] === value),
  );
}

function createFakeGitRoot(dir: string): void {
  mkdirSync(join(dir, ".git"));
}

describe("boboddy steps", () => {
  describe("help output", () => {
    concurrentTest("steps --help lists init and push subcommands", () => {
      const result = run(["steps", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("init");
      expect(result.stdout).toContain("push");
    });

    concurrentTest("top-level --help includes steps command", () => {
      const result = run(["--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("steps");
    });

    concurrentTest("steps push --help shows projectId argument", () => {
      const result = run(["steps", "push", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("projectId");
    });
  });

  describe("steps init", () => {
    concurrentTest("creates .boboddy/steps directory with all scaffold files", () => {
      const fakeProjectDir = mkdtempSync(join(tmpdir(), "boboddy-init-test-"));
      try {
        createFakeGitRoot(fakeProjectDir);
        const result = run(["steps", "init"], { cwd: fakeProjectDir });

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");

        const stepsDir = join(fakeProjectDir, ".boboddy", "steps");
        expect(existsSync(stepsDir)).toBe(true);
        expect(existsSync(join(stepsDir, "package.json"))).toBe(true);
        expect(existsSync(join(stepsDir, "tsconfig.json"))).toBe(true);
        expect(existsSync(join(stepsDir, ".gitignore"))).toBe(true);
        expect(existsSync(join(stepsDir, "evaluate-clarity.ts"))).toBe(true);
      } finally {
        rmSync(fakeProjectDir, { recursive: true, force: true });
      }
    });

    concurrentTest("logs a created message for each file", () => {
      const fakeProjectDir = mkdtempSync(join(tmpdir(), "boboddy-init-test-"));
      try {
        createFakeGitRoot(fakeProjectDir);
        const result = run(["steps", "init"], { cwd: fakeProjectDir });
        const logs = parseLogLines(result.stdout);

        expect(hasLogLine(logs, { file: "package.json" })).toBe(true);
        expect(hasLogLine(logs, { file: "tsconfig.json" })).toBe(true);
        expect(hasLogLine(logs, { file: ".gitignore" })).toBe(true);
        expect(hasLogLine(logs, { file: "evaluate-clarity.ts" })).toBe(true);
      } finally {
        rmSync(fakeProjectDir, { recursive: true, force: true });
      }
    });

    concurrentTest("is idempotent — skips existing files on second run", () => {
      const fakeProjectDir = mkdtempSync(join(tmpdir(), "boboddy-init-test-"));
      try {
        createFakeGitRoot(fakeProjectDir);
        run(["steps", "init"], { cwd: fakeProjectDir });
        const second = run(["steps", "init"], { cwd: fakeProjectDir });

        expect(second.exitCode).toBe(0);
        const logs = parseLogLines(second.stdout);
        // On second run there should be skipped-file warnings, not created-file infos
        const skippedMsgs = logs.filter((l) =>
          typeof l["msg"] === "string" && l["msg"].includes("Skipped"),
        );
        expect(skippedMsgs.length).toBeGreaterThan(0);
      } finally {
        rmSync(fakeProjectDir, { recursive: true, force: true });
      }
    });

    concurrentTest("fails outside the root of a git repository", () => {
      const fakeProjectDir = mkdtempSync(join(tmpdir(), "boboddy-init-test-"));
      try {
        const result = run(["steps", "init"], { cwd: fakeProjectDir });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe("");

        const logs = parseLogLines(result.stdout);
        const errorLog = logs.find((log) => log["level"] === 50);
        expect(errorLog).toBeDefined();
        expect(errorLog?.["msg"]).toBe(
          "`boboddy steps init` must be run from the root of a git repository. Navigate to your repo root and try again.",
        );
      } finally {
        rmSync(fakeProjectDir, { recursive: true, force: true });
      }
    });
  });

  describe("steps push", () => {
    concurrentTest("exits with error and helpful message when not signed in", () => {
      const fakeHome = mkdtempSync(join(tmpdir(), "boboddy-push-test-"));
      try {
        const result = run(
          ["steps", "push", "01966a2c-9494-7db5-aa46-0f8f5cbbe001"],
          { env: { HOME: fakeHome } },
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe("");

        const logs = parseLogLines(result.stdout);
        const errorLog = logs.find((l) => l["level"] === 50);
        expect(errorLog).toBeDefined();
        expect(typeof errorLog?.["msg"]).toBe("string");
        expect((errorLog?.["msg"] as string).toLowerCase()).toContain("not signed in");
      } finally {
        rmSync(fakeHome, { recursive: true, force: true });
      }
    });

    concurrentTest("fails without a projectId argument", () => {
      const result = run(["steps", "push"]);
      expect(result.exitCode).toBe(1);
    });
  });
});
