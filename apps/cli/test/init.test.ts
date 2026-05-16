import { describe, expect } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { concurrentTest } from "./utils";
import {
  deriveProjectName,
  readProjectConfig,
  writeProjectConfig,
} from "../src/init/project-config";

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

describe("boboddy init", () => {
  describe("help output", () => {
    concurrentTest("init appears in top-level help", () => {
      const result = run(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("init");
    });

    concurrentTest("init --help shows base-url option", () => {
      const result = run(["init", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("--base-url");
    });
  });

  describe("pre-checks", () => {
    concurrentTest("errors when not authenticated", () => {
      const fakeHome = mkdtempSync(resolve(tmpdir(), "boboddy-init-"));
      try {
        const result = run(
          ["init", "--base-url", "https://example.com"],
          { env: { HOME: fakeHome } },
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe("");
        expect(
          hasLogLine(parseLogLines(result.stdout), { msg: "Not signed in to https://example.com. Run 'boboddy auth login' first." }),
        ).toBe(true);
      } finally {
        rmSync(fakeHome, { recursive: true, force: true });
      }
    });
  });

  describe("project config helpers", () => {
    concurrentTest("readProjectConfig returns null when file does not exist", async () => {
      const tmpDir = mkdtempSync(resolve(tmpdir(), "boboddy-init-config-"));
      try {
        const config = await readProjectConfig(tmpDir);
        expect(config).toBeNull();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    concurrentTest("readProjectConfig returns null when file has no projectId", async () => {
      const tmpDir = mkdtempSync(resolve(tmpdir(), "boboddy-init-config-"));
      try {
        mkdirSync(join(tmpDir, ".boboddy"));
        writeFileSync(join(tmpDir, ".boboddy", "boboddy.jsonc"), '{ "other": "value" }', "utf8");
        const config = await readProjectConfig(tmpDir);
        expect(config).toBeNull();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    concurrentTest("writeProjectConfig then readProjectConfig round-trips projectId", async () => {
      const tmpDir = mkdtempSync(resolve(tmpdir(), "boboddy-init-config-"));
      try {
        await writeProjectConfig("01jv-test-id", tmpDir);
        const config = await readProjectConfig(tmpDir);
        expect(config).toEqual({ projectId: "01jv-test-id" });
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    concurrentTest("readProjectConfig handles JSONC with comments", async () => {
      const tmpDir = mkdtempSync(resolve(tmpdir(), "boboddy-init-config-"));
      try {
        mkdirSync(join(tmpDir, ".boboddy"));
        writeFileSync(
          join(tmpDir, ".boboddy", "boboddy.jsonc"),
          '// auto-generated\n{ "projectId": "abc-123" }',
          "utf8",
        );
        const config = await readProjectConfig(tmpDir);
        expect(config).toEqual({ projectId: "abc-123" });
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("deriveProjectName", () => {
    concurrentTest("extracts name from HTTPS URL with .git suffix", () => {
      expect(deriveProjectName("https://github.com/user/my-repo.git")).toBe("my-repo");
    });

    concurrentTest("extracts name from HTTPS URL without .git suffix", () => {
      expect(deriveProjectName("https://github.com/user/my-repo")).toBe("my-repo");
    });

    concurrentTest("extracts name from SSH URL", () => {
      expect(deriveProjectName("git@github.com:user/my-repo.git")).toBe("my-repo");
    });

    concurrentTest("handles URL with no path segments", () => {
      expect(deriveProjectName("my-repo")).toBe("my-repo");
    });
  });
});
