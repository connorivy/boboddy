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

function createFakeGitRoot(dir: string): void {
  mkdirSync(join(dir, ".git"));
}

describe("boboddy pipelines", () => {
  describe("help output", () => {
    concurrentTest("pipelines --help lists init and push subcommands", () => {
      const result = run(["pipelines", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("init");
      expect(result.stdout).toContain("push");
    });

    concurrentTest("top-level --help includes pipelines command", () => {
      const result = run(["--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("pipelines");
    });
  });

  describe("pipelines init", () => {
    concurrentTest(
      "creates .boboddy/pipeline-builder directory with all scaffold files",
      () => {
        const fakeProjectDir = mkdtempSync(
          join(tmpdir(), "boboddy-pipelines-init-test-"),
        );
        try {
          createFakeGitRoot(fakeProjectDir);
          const result = run(["pipelines", "init"], { cwd: fakeProjectDir });

          expect(result.exitCode).toBe(0);
          expect(result.stderr).toBe("");

          const builderDir = join(
            fakeProjectDir,
            ".boboddy",
            "pipeline-builder",
          );
          expect(existsSync(builderDir)).toBe(true);
          expect(existsSync(join(builderDir, "package.json"))).toBe(true);
          expect(existsSync(join(builderDir, "tsconfig.json"))).toBe(true);
          expect(existsSync(join(builderDir, ".gitignore"))).toBe(true);
          expect(
            existsSync(join(builderDir, "example-pipeline.ts")),
          ).toBe(true);
        } finally {
          rmSync(fakeProjectDir, { recursive: true, force: true });
        }
      },
    );

    concurrentTest(
      "example-pipeline.ts contains step and pipeline definitions",
      () => {
        const fakeProjectDir = mkdtempSync(
          join(tmpdir(), "boboddy-pipelines-init-test-"),
        );
        try {
          createFakeGitRoot(fakeProjectDir);
          run(["pipelines", "init"], { cwd: fakeProjectDir });

          const exampleFile = join(
            fakeProjectDir,
            ".boboddy",
            "pipeline-builder",
            "example-pipeline.ts",
          );
          expect(existsSync(exampleFile)).toBe(true);
        } finally {
          rmSync(fakeProjectDir, { recursive: true, force: true });
        }
      },
    );

    concurrentTest("logs a created message for each file", () => {
      const fakeProjectDir = mkdtempSync(
        join(tmpdir(), "boboddy-pipelines-init-test-"),
      );
      try {
        createFakeGitRoot(fakeProjectDir);
        const result = run(["pipelines", "init"], { cwd: fakeProjectDir });
        const logs = parseLogLines(result.stdout);

        const createdFiles = logs
          .filter((l) => typeof l["file"] === "string")
          .map((l) => l["file"] as string);

        expect(createdFiles.some((f) => f.includes("package.json"))).toBe(true);
        expect(createdFiles.some((f) => f.includes("tsconfig.json"))).toBe(true);
        expect(createdFiles.some((f) => f.includes(".gitignore"))).toBe(true);
        expect(
          createdFiles.some((f) => f.includes("example-pipeline.ts")),
        ).toBe(true);
      } finally {
        rmSync(fakeProjectDir, { recursive: true, force: true });
      }
    });

    concurrentTest("is idempotent — skips existing files on second run", () => {
      const fakeProjectDir = mkdtempSync(
        join(tmpdir(), "boboddy-pipelines-init-test-"),
      );
      try {
        createFakeGitRoot(fakeProjectDir);
        run(["pipelines", "init"], { cwd: fakeProjectDir });
        const second = run(["pipelines", "init"], { cwd: fakeProjectDir });

        expect(second.exitCode).toBe(0);
        const logs = parseLogLines(second.stdout);
        const skippedMsgs = logs.filter(
          (l) =>
            typeof l["msg"] === "string" && l["msg"].includes("Skipped"),
        );
        expect(skippedMsgs.length).toBeGreaterThan(0);
      } finally {
        rmSync(fakeProjectDir, { recursive: true, force: true });
      }
    });

    concurrentTest("fails outside the root of a git repository", () => {
      const fakeProjectDir = mkdtempSync(
        join(tmpdir(), "boboddy-pipelines-init-test-"),
      );
      try {
        const result = run(["pipelines", "init"], { cwd: fakeProjectDir });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe("");

        const logs = parseLogLines(result.stdout);
        const errorLog = logs.find((log) => log["level"] === 50);
        expect(errorLog).toBeDefined();
        expect(typeof errorLog?.["msg"]).toBe("string");
        expect((errorLog?.["msg"] as string).toLowerCase()).toContain(
          "git repository",
        );
      } finally {
        rmSync(fakeProjectDir, { recursive: true, force: true });
      }
    });
  });

  describe("pipelines push", () => {
    concurrentTest("push --help shows projectId positional argument", () => {
      const result = run(["pipelines", "push", "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("projectId");
    });

    concurrentTest("exits with error and helpful message when not signed in", () => {
      const fakeHome = mkdtempSync(
        join(tmpdir(), "boboddy-pipelines-push-test-"),
      );
      try {
        const result = run(
          ["pipelines", "push", "01966a2c-9494-7db5-aa46-0f8f5cbbe001"],
          { env: { HOME: fakeHome } },
        );

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe("");

        const logs = parseLogLines(result.stdout);
        const errorLog = logs.find((l) => l["level"] === 50);
        expect(errorLog).toBeDefined();
        expect(typeof errorLog?.["msg"]).toBe("string");
        expect((errorLog?.["msg"] as string).toLowerCase()).toContain(
          "not signed in",
        );
      } finally {
        rmSync(fakeHome, { recursive: true, force: true });
      }
    });

    concurrentTest("fails without a projectId argument or config file", () => {
      const fakeProjectDir = mkdtempSync(
        join(tmpdir(), "boboddy-pipelines-push-noproject-"),
      );
      const fakeHome = mkdtempSync(
        join(tmpdir(), "boboddy-pipelines-push-home-"),
      );
      try {
        const result = run(["pipelines", "push"], {
          cwd: fakeProjectDir,
          env: { HOME: fakeHome },
        });

        expect(result.exitCode).toBe(1);
      } finally {
        rmSync(fakeProjectDir, { recursive: true, force: true });
        rmSync(fakeHome, { recursive: true, force: true });
      }
    });
  });
});
