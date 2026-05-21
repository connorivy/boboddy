import { describe, expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPrompt,
  ensureDevcontainer,
  hasDevcontainer,
} from "../../../../src/project/project-setup/application/ensure-devcontainer";
import { concurrentTest } from "../../../utils";

describe("hasDevcontainer", () => {
  concurrentTest("returns true for .devcontainer/devcontainer.json", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "boboddy-devcontainer-"));
    try {
      mkdirSync(join(tmpDir, ".devcontainer"));
      writeFileSync(join(tmpDir, ".devcontainer", "devcontainer.json"), "{}", "utf8");
      expect(await hasDevcontainer(tmpDir)).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  concurrentTest("returns false when neither config exists", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "boboddy-devcontainer-"));
    try {
      expect(await hasDevcontainer(tmpDir)).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("buildPrompt", () => {
  concurrentTest("includes Next.js label for nextjs framework", () => {
    const prompt = buildPrompt({ kind: "web_app", framework: "nextjs", hasPlaywright: false, confidence: "high" }, "{}");
    expect(prompt).toContain("Next.js");
  });
});

describe("ensureDevcontainer", () => {
  concurrentTest("skips without launching Docker when devcontainer already exists", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "boboddy-devcontainer-"));
    try {
      mkdirSync(join(tmpDir, ".devcontainer"));
      writeFileSync(join(tmpDir, ".devcontainer", "devcontainer.json"), "{}", "utf8");
      expect(
        ensureDevcontainer({
          baseUrl: "https://example.com",
          projectId: "01900000-0000-7000-8000-000000000001",
          confirmed: true,
          workspacePath: tmpDir,
        }),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  concurrentTest("skips when generation is not confirmed", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "boboddy-devcontainer-"));
    try {
      await expect(
        ensureDevcontainer({
          baseUrl: "https://example.com",
          projectId: "01900000-0000-7000-8000-000000000001",
          confirmed: false,
          workspacePath: tmpDir,
        }),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
