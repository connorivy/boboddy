import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldStepsDirectory } from "../../../../src/steps/step-definitions/infra/step-scaffolder";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "scaffold-test-"));
}

describe("scaffoldStepsDirectory", () => {
  describe("fresh directory", () => {
    test("creates package.json, tsconfig.json, .gitignore, and an example step", () => {
      const dir = makeTempDir();
      try {
        const result = scaffoldStepsDirectory(dir, "0.0.0");

        expect(result.created).toContain("package.json");
        expect(result.created).toContain("tsconfig.json");
        expect(result.created).toContain(".gitignore");
        expect(result.created).toContain("evaluate-clarity.ts");
        expect(result.skipped).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("all four files exist on disk after init", () => {
      const dir = makeTempDir();
      try {
        scaffoldStepsDirectory(dir, "0.0.0");

        expect(existsSync(join(dir, "package.json"))).toBe(true);
        expect(existsSync(join(dir, "tsconfig.json"))).toBe(true);
        expect(existsSync(join(dir, ".gitignore"))).toBe(true);
        expect(existsSync(join(dir, "evaluate-clarity.ts"))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("file contents", () => {
    test(".gitignore contains a wildcard to ignore everything", () => {
      const dir = makeTempDir();
      try {
        scaffoldStepsDirectory(dir, "0.0.0");
        const content = readFileSync(join(dir, ".gitignore"), "utf-8");
        expect(content.trim()).toBe("*");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("package.json contains @boboddy/sdk and zod dependencies", () => {
      const dir = makeTempDir();
      try {
        scaffoldStepsDirectory(dir, "0.0.0");
        const content = readFileSync(join(dir, "package.json"), "utf-8");
        const parsed = JSON.parse(content) as Record<string, unknown>;
        const deps = parsed["dependencies"] as Record<string, unknown>;
        expect(deps).toHaveProperty("@boboddy/sdk");
        expect(deps).toHaveProperty("zod");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("package.json uses a linked dependency for @boboddy/sdk in dev mode", () => {
      const dir = makeTempDir();
      const previous = process.env["BOBODDY_LINK_SDK"];
      process.env["BOBODDY_LINK_SDK"] = "1";
      try {
        scaffoldStepsDirectory(dir, "0.0.0");
        const content = readFileSync(join(dir, "package.json"), "utf-8");
        const parsed = JSON.parse(content) as Record<string, unknown>;
        const deps = parsed["dependencies"] as Record<string, unknown>;
        expect(deps["@boboddy/sdk"]).toBe("link:@boboddy/sdk");
      } finally {
        if (previous === undefined) {
          delete process.env["BOBODDY_LINK_SDK"];
        } else {
          process.env["BOBODDY_LINK_SDK"] = previous;
        }
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("tsconfig.json is self-contained with essential compiler options", () => {
      const dir = makeTempDir();
      try {
        scaffoldStepsDirectory(dir, "0.0.0");
        const content = readFileSync(join(dir, "tsconfig.json"), "utf-8");
        const parsed = JSON.parse(content) as Record<string, unknown>;
        expect(parsed["extends"]).toBeUndefined();
        const compilerOptions = parsed["compilerOptions"] as Record<string, unknown>;
        expect(compilerOptions["strict"]).toBe(true);
        expect(compilerOptions["moduleResolution"]).toBe("Bundler");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("example step imports defineStep and exports a step with the right key", () => {
      const dir = makeTempDir();
      try {
        scaffoldStepsDirectory(dir, "0.0.0");
        const content = readFileSync(join(dir, "evaluate-clarity.ts"), "utf-8");
        expect(content).toContain("defineStep");
        expect(content).toContain("evaluate-clarity");
        expect(content).toContain("export default");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("idempotency", () => {
    test("skips files that already exist on a second run", () => {
      const dir = makeTempDir();
      try {
        scaffoldStepsDirectory(dir, "0.0.0");
        const second = scaffoldStepsDirectory(dir, "0.0.0");

        expect(second.created).toEqual([]);
        expect(second.skipped).toContain("package.json");
        expect(second.skipped).toContain("tsconfig.json");
        expect(second.skipped).toContain(".gitignore");
        expect(second.skipped).toContain("evaluate-clarity.ts");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("creates missing files without touching existing ones", () => {
      const dir = makeTempDir();
      try {
        // First run creates everything
        scaffoldStepsDirectory(dir, "0.0.0");
        // Manually delete one file
        rmSync(join(dir, "evaluate-clarity.ts"));

        const second = scaffoldStepsDirectory(dir, "0.0.0");

        expect(second.created).toEqual(["evaluate-clarity.ts"]);
        expect(second.skipped).toContain("package.json");
        expect(second.skipped).toContain("tsconfig.json");
        expect(second.skipped).toContain(".gitignore");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("directory creation", () => {
    test("creates the target directory if it does not exist", () => {
      const parent = makeTempDir();
      const dir = join(parent, "nested", "steps");
      try {
        scaffoldStepsDirectory(dir, "0.0.0");
        expect(existsSync(dir)).toBe(true);
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    });
  });
});
