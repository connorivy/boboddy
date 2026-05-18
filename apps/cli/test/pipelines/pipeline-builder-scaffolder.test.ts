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
  key: "evaluate-clarity",
  name: "Evaluate Clarity",
  version: 1,
  signals: [{ key: "clarity_score", sourcePath: "score", type: "number" }],
};

describe("scaffoldPipelineBuilderDirectory", () => {
  describe("fresh directory", () => {
    test("creates package.json, tsconfig.json, .gitignore, step files, and example pipeline", () => {
      const dir = makeTempDir();
      try {
        const result = scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);

        expect(result.created).toContain("package.json");
        expect(result.created).toContain("tsconfig.json");
        expect(result.created).toContain(".gitignore");
        expect(result.created).toContain(join("steps", "evaluate-clarity.ts"));
        expect(result.created).toContain(join("pipelines", "example-pipeline.ts"));
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
        expect(existsSync(join(dir, "steps", "evaluate-clarity.ts"))).toBe(true);
        expect(existsSync(join(dir, "pipelines", "example-pipeline.ts"))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("creates steps and pipelines subdirectories", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, []);

        expect(existsSync(join(dir, "steps"))).toBe(true);
        expect(existsSync(join(dir, "pipelines"))).toBe(true);
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

    test("tsconfig.json is self-contained with essential compiler options", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, []);
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

    test("step file contains correct key, name, version, and signals", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);
        const content = readFileSync(
          join(dir, "steps", "evaluate-clarity.ts"),
          "utf-8",
        );
        expect(content).toContain("defineStep");
        expect(content).toContain("evaluate-clarity");
        expect(content).toContain("Evaluate Clarity");
        expect(content).toContain("clarity_score");
        expect(content).toContain("score");
        expect(content).toContain("export default");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("example pipeline imports the step and uses definePipeline", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);
        const content = readFileSync(
          join(dir, "pipelines", "example-pipeline.ts"),
          "utf-8",
        );
        expect(content).toContain("definePipeline");
        expect(content).toContain("evaluateClarity");
        expect(content).toContain("example-pipeline");
        expect(content).toContain("export default");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("example pipeline includes Rule.when for step with signals", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);
        const content = readFileSync(
          join(dir, "pipelines", "example-pipeline.ts"),
          "utf-8",
        );
        expect(content).toContain("Rule");
        expect(content).toContain("Rule.when");
        expect(content).toContain("clarity_score");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("example pipeline with no steps uses an empty steps array", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, []);
        const content = readFileSync(
          join(dir, "pipelines", "example-pipeline.ts"),
          "utf-8",
        );
        expect(content).toContain("steps: []");
        expect(content).not.toContain("Rule");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("multiple steps each get their own file and are all imported in the pipeline", () => {
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

        expect(existsSync(join(dir, "steps", "step-one.ts"))).toBe(true);
        expect(existsSync(join(dir, "steps", "step-two.ts"))).toBe(true);

        const pipelineContent = readFileSync(
          join(dir, "pipelines", "example-pipeline.ts"),
          "utf-8",
        );
        expect(pipelineContent).toContain("stepOne");
        expect(pipelineContent).toContain("stepTwo");
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
        expect(second.skipped).toContain(join("steps", "evaluate-clarity.ts"));
        expect(second.skipped).toContain(join("pipelines", "example-pipeline.ts"));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("creates missing files without touching existing ones", () => {
      const dir = makeTempDir();
      try {
        scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);
        rmSync(join(dir, "steps", "evaluate-clarity.ts"));

        const second = scaffoldPipelineBuilderDirectory(dir, [EXAMPLE_STEP]);

        expect(second.created).toEqual([join("steps", "evaluate-clarity.ts")]);
        expect(second.skipped).toContain("package.json");
        expect(second.skipped).toContain("tsconfig.json");
        expect(second.skipped).toContain(".gitignore");
        expect(second.skipped).toContain(join("pipelines", "example-pipeline.ts"));
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
