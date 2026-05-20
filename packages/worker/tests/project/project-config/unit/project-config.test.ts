import { describe, expect } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { concurrentTest } from "../../../utils";
import { deriveProjectName } from "../../../../src/project/project-config/infra/fs-project-config-repo";
import { readProjectConfig } from "../../../../src/project/project-config/application/read-project-config";
import { writeProjectConfig } from "../../../../src/project/project-config/application/write-project-config";

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

  concurrentTest("deriveProjectName extracts name from HTTPS URL with .git suffix", () => {
    expect(deriveProjectName("https://github.com/user/my-repo.git")).toBe("my-repo");
  });

  concurrentTest("deriveProjectName extracts name from SSH URL", () => {
    expect(deriveProjectName("git@github.com:user/my-repo.git")).toBe("my-repo");
  });
});
