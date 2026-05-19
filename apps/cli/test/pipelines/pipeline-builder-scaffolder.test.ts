import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scaffoldPipelineBuilderDirectory,
  type StepInfo,
} from "../../src/pipelines/pipeline-builder-scaffolder";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "pipeline-builder-test-"));
}

const EXAMPLE_STEP: StepInfo = {
  key: "investigate",
  name: "Investigate",
  version: 1,
  prompt:
    "You are an expert investigator. Analyze the provided content thoroughly to identify the root cause, assess the severity, and recommend next steps.",
  signals: [{ key: "confidence", sourcePath: "confidence", type: "number" }],
};

describe("scaffoldPipelineBuilderDirectory", () => {
  describe("fresh directory", () => {
    test("creates package.json, tsconfig.json, .gitignore, and example-pipeline.ts", () => {
      const dir = makeTempDir();
      try {
        const result = scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);

        expect(result.created).toContain("package.json");
        expect(result.created).toContain("tsconfig.json");
        expect(result.created).toContain(".gitignore");
        expect(result.created).toContain("example-pipeline.ts");
        expect(result.skipped).toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("all files exist on disk after scaffold", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);

        expect(existsSync(join(dir, "package.json"))).toBe(true);
        expect(existsSync(join(dir, "tsconfig.json"))).toBe(true);
        expect(existsSync(join(dir, ".gitignore"))).toBe(true);
        expect(existsSync(join(dir, "example-pipeline.ts"))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("does not create steps or pipelines subdirectories", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, []);

        expect(existsSync(join(dir, "steps"))).toBe(false);
        expect(existsSync(join(dir, "pipelines"))).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("file contents", () => {
    test(".gitignore contains a wildcard to ignore everything", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, []);
        const content = readFileSync(join(dir, ".gitignore"), "utf-8");
        expect(content.trim()).toBe("*");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("package.json contains @boboddy/sdk and zod dependencies", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, []);
        const content = readFileSync(join(dir, "package.json"), "utf-8");
        const parsed = JSON.parse(content) as Record<string, unknown>;
        const deps = parsed["dependencies"] as Record<string, unknown>;
        expect(deps).toHaveProperty("@boboddy/sdk");
        expect(deps).toHaveProperty("zod");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("package.json uses a local file dependency for @boboddy/sdk in dev mode", () => {
      const dir = makeTempDir();
      const previous = process.env.BOBODDY_DEV_SDK_PATH;
      process.env.BOBODDY_DEV_SDK_PATH = "/tmp/boboddy sdk";
      try {
        scaffoldPipelineBuilderDirectory(dir, []);
        const content = readFileSync(join(dir, "package.json"), "utf-8");
        const parsed = JSON.parse(content) as Record<string, unknown>;
        const deps = parsed["dependencies"] as Record<string, unknown>;
        expect(deps["@boboddy/sdk"]).toBe("file:/tmp/boboddy sdk");
      } finally {
        if (previous === undefined) {
          delete process.env.BOBODDY_DEV_SDK_PATH;
        } else {
          process.env.BOBODDY_DEV_SDK_PATH = previous;
        }
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("tsconfig.json is self-contained with essential compiler options", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, []);
        const content = readFileSync(join(dir, "tsconfig.json"), "utf-8");
        const parsed = JSON.parse(content) as Record<string, unknown>;
        expect(parsed["extends"]).toBeUndefined();
        const compilerOptions = parsed["compilerOptions"] as Record<
          string,
          unknown
        >;
        expect(compilerOptions["strict"]).toBe(true);
        expect(compilerOptions["moduleResolution"]).toBe("Bundler");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("example-pipeline.ts contains step key, name, version, signals, input, and result", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);
        const content = readFileSync(join(dir, "example-pipeline.ts"), "utf-8");
        expect(content).toContain("defineStep");
        expect(content).toContain("investigate");
        expect(content).toContain("Investigate");
        expect(content).toContain("confidence");
        expect(content).toContain("prompt:");
        expect(content).toContain("input:");
        expect(content).toContain("result:");
        expect(content).toContain("z.object");
        expect(content).toContain("export default");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("example-pipeline.ts defines both the step and the pipeline in one file", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);
        const content = readFileSync(join(dir, "example-pipeline.ts"), "utf-8");
        expect(content).toContain("defineStep");
        expect(content).toContain("definePipeline");
        expect(content).toContain("investigate");
        expect(content).toContain("investigation");
        expect(content).toContain("export default");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("example-pipeline.ts includes Rule.when for step with signals", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);
        const content = readFileSync(join(dir, "example-pipeline.ts"), "utf-8");
        expect(content).toContain("Rule");
        expect(content).toContain("Rule.when");
        expect(content).toContain("confidence");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("example-pipeline.ts with no steps uses an empty steps array", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, []);
        const content = readFileSync(join(dir, "example-pipeline.ts"), "utf-8");
        expect(content).toContain("steps: []");
        expect(content).not.toContain("Rule");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("multiple steps are all defined and referenced in example-pipeline.ts", () => {
      const dir = makeTempDir();
      const steps: StepInfo[] = [
        {
          key: "step-one",
          name: "Step One",
          version: 1,
          signals: [{ key: "score", sourcePath: "score", type: "number" }],
        },
        {
          key: "step-two",
          name: "Step Two",
          version: 2,
          signals: [],
        },
      ];
      try {
        scaffoldPipelineBuilderDirectory(dir, steps);

        const content = readFileSync(join(dir, "example-pipeline.ts"), "utf-8");
        expect(content).toContain("stepOne");
        expect(content).toContain("stepTwo");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("idempotency", () => {
    test("skips files that already exist on a second run", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);
        const second = scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);

        expect(second.created).toEqual([]);
        expect(second.skipped).toContain("package.json");
        expect(second.skipped).toContain("tsconfig.json");
        expect(second.skipped).toContain(".gitignore");
        expect(second.skipped).toContain("example-pipeline.ts");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("creates missing files without touching existing ones", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);
        rmSync(join(dir, "example-pipeline.ts"));

        const second = scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);

        expect(second.created).toEqual(["example-pipeline.ts"]);
        expect(second.skipped).toContain("package.json");
        expect(second.skipped).toContain("tsconfig.json");
        expect(second.skipped).toContain(".gitignore");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("directory creation", () => {
    test("creates nested target directory if it does not exist", () => {
      const parent = makeTempDir();
      const dir = join(parent, "nested", "pipeline-builder");
      try {
        scaffoldPipelineBuilderDirectory(dir, []);
        expect(existsSync(dir)).toBe(true);
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    });
  });
});
