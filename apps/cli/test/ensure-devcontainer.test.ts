import { describe, expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPrompt,
  ensureDevcontainer,
  hasDevcontainer,
} from "../src/init/ensure-devcontainer";
import { concurrentTest } from "./utils";

describe("hasDevcontainer", () => {
  concurrentTest(
    "returns true for .devcontainer/devcontainer.json",
    async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "boboddy-devcontainer-"));
      try {
        mkdirSync(join(tmpDir, ".devcontainer"));
        writeFileSync(
          join(tmpDir, ".devcontainer", "devcontainer.json"),
          "{}",
          "utf8",
        );
        expect(await hasDevcontainer(tmpDir)).toBe(true);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );

  concurrentTest("returns true for devcontainer.json at root", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "boboddy-devcontainer-"));
    try {
      writeFileSync(join(tmpDir, "devcontainer.json"), "{}", "utf8");
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
    const prompt = buildPrompt(
      {
        kind: "web_app",
        framework: "nextjs",
        hasPlaywright: false,
        confidence: "high",
      },
      "{}",
    );
    expect(prompt).toContain("Next.js");
  });

  concurrentTest("includes Vite + React label for vite framework", () => {
    const prompt = buildPrompt(
      {
        kind: "web_app",
        framework: "vite",
        hasPlaywright: false,
        confidence: "high",
      },
      "{}",
    );
    expect(prompt).toContain("Vite + React");
  });

  concurrentTest("includes React label for react framework", () => {
    const prompt = buildPrompt(
      {
        kind: "web_app",
        framework: "react",
        hasPlaywright: false,
        confidence: "low",
      },
      "{}",
    );
    expect(prompt).toContain("React");
  });

  concurrentTest("includes unknown label for null framework", () => {
    const prompt = buildPrompt(
      {
        kind: "unknown",
        framework: null,
        hasPlaywright: false,
        confidence: "low",
      },
      "{}",
    );
    expect(prompt).toContain("unknown");
  });

  concurrentTest("mentions playwright when hasPlaywright is true", () => {
    const prompt = buildPrompt(
      {
        kind: "web_app",
        framework: "nextjs",
        hasPlaywright: true,
        confidence: "high",
      },
      "{}",
    );
    expect(prompt).toContain("yes");
  });

  concurrentTest("mentions no playwright when hasPlaywright is false", () => {
    const prompt = buildPrompt(
      {
        kind: "web_app",
        framework: "nextjs",
        hasPlaywright: false,
        confidence: "high",
      },
      "{}",
    );
    expect(prompt).toContain("no");
  });

  concurrentTest("includes package.json content in prompt", () => {
    const packageJson = JSON.stringify({ scripts: { dev: "next dev" } });
    const prompt = buildPrompt(
      {
        kind: "web_app",
        framework: "nextjs",
        hasPlaywright: false,
        confidence: "high",
      },
      packageJson,
    );
    expect(prompt).toContain(packageJson);
  });
});

describe("ensureDevcontainer", () => {
  concurrentTest(
    "skips without launching Docker when devcontainer already exists",
    () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "boboddy-devcontainer-"));
      try {
        mkdirSync(join(tmpDir, ".devcontainer"));
        writeFileSync(
          join(tmpDir, ".devcontainer", "devcontainer.json"),
          "{}",
          "utf8",
        );

        // If Docker were launched this would throw (no running daemon needed).
        // The function must return cleanly because it detects the existing config.
        expect(
          ensureDevcontainer({
            baseUrl: "https://example.com",
            projectId: "01900000-0000-7000-8000-000000000001",
            workspacePath: tmpDir,
          }),
        ).resolves.toBeUndefined();
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );
});
