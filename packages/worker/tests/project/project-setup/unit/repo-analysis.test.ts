import { describe, expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeRepo } from "../../../../src/project/project-setup/application/repo-analysis";
import { concurrentTest } from "../../../utils";

describe("repo analysis", () => {
  concurrentTest("detects a Next.js web app", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "boboddy-repo-analysis-"));

    try {
      writeFileSync(
        join(tmpDir, "package.json"),
        JSON.stringify({ dependencies: { next: "15.0.0", react: "19.0.0" } }),
        "utf8",
      );
      writeFileSync(join(tmpDir, "next.config.ts"), "export default {}\n", "utf8");

      const analysis = await analyzeRepo(tmpDir);

      expect(analysis).toEqual({
        kind: "web_app",
        framework: "nextjs",
        hasPlaywright: false,
        confidence: "high",
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  concurrentTest("detects a Vite React app with Playwright", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "boboddy-repo-analysis-"));

    try {
      writeFileSync(
        join(tmpDir, "package.json"),
        JSON.stringify({
          dependencies: { react: "19.0.0", vite: "6.0.0" },
          devDependencies: { "@playwright/test": "1.54.0" },
        }),
        "utf8",
      );
      writeFileSync(join(tmpDir, "vite.config.ts"), "export default {}\n", "utf8");

      const analysis = await analyzeRepo(tmpDir);

      expect(analysis).toEqual({
        kind: "web_app",
        framework: "vite",
        hasPlaywright: true,
        confidence: "high",
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  concurrentTest("returns unknown for an unrecognized repo", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "boboddy-repo-analysis-"));

    try {
      mkdirSync(join(tmpDir, "docs"));
      writeFileSync(join(tmpDir, "README.md"), "# Notes\n", "utf8");

      const analysis = await analyzeRepo(tmpDir);

      expect(analysis).toEqual({
        kind: "unknown",
        framework: null,
        hasPlaywright: false,
        confidence: "low",
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
