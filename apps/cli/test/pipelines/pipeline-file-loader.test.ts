import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPipelinesFromDirectory } from "../../src/pipelines/pipeline-file-loader";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "pipeline-loader-test-"));
}

// Minimal valid PipelineDefinitionSpec — shape-only, no SDK imports needed.
// The loader checks structure (key, name, version, steps[]), not origin.
const VALID_PIPELINE_JS = `
export default {
  key: "investigation",
  name: "Investigation",
  description: null,
  version: 1,
  status: "active",
  steps: [],
};
`;

const PIPELINE_WITH_STEPS_JS = `
export default {
  key: "multi-step",
  name: "Multi Step",
  description: "Pipeline with a step",
  version: 2,
  status: "draft",
  steps: [
    {
      stepKey: "evaluate-clarity",
      stepName: "Evaluate Clarity",
      stepDescription: null,
      position: 1,
      inputBindingsJson: {},
      timeoutSeconds: null,
      advancementPolicyDefinition: {
        rulesJson: { rules: [] },
        defaultEventType: "continue",
        defaultEventParamsJson: null,
        allowedEventTypes: ["continue"],
      },
    },
  ],
};
`;

// A StepDefinitionSpec has no `steps` array — the loader should skip it silently.
const STEP_DEF_JS = `
export default {
  key: "evaluate-clarity",
  name: "Evaluate Clarity",
  version: 1,
  kind: "user_defined",
  status: "active",
  description: null,
  prompt: null,
  inputSchemaJson: null,
  resultSchemaJson: null,
  signalExtractorDefinitions: [],
  computedSignalDefinitions: [],
  opencodeMcpJson: null,
};
`;

// A file that exports step defs as named exports AND a pipeline as the default.
// This mirrors the scaffolded example-pipeline.ts layout.
const MIXED_FILE_JS = `
export const investigateStep = {
  key: "investigate",
  name: "Investigate",
  version: 1,
  kind: "user_defined",
  status: "active",
  description: null,
  prompt: null,
  inputSchemaJson: null,
  resultSchemaJson: null,
  signalExtractorDefinitions: [],
  computedSignalDefinitions: [],
  opencodeMcpJson: null,
};

export default {
  key: "my-pipeline",
  name: "My Pipeline",
  description: null,
  version: 1,
  status: "active",
  steps: [],
};
`;

describe("loadPipelinesFromDirectory", () => {
  test("returns an empty array for a directory with no source files", async () => {
    const dir = makeTempDir();
    try {
      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ignores non-TypeScript and non-JavaScript files", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "README.md"), "# Pipelines");
      writeFileSync(join(dir, "config.json"), "{}");
      writeFileSync(join(dir, ".gitignore"), "*");

      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loads a valid pipeline from a .js file", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "investigation.js"), VALID_PIPELINE_JS);

      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toHaveLength(1);
      expect(specs[0]).toMatchObject({
        key: "investigation",
        name: "Investigation",
        version: 1,
        status: "active",
        steps: [],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("preserves steps array with full step config", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "multi-step.js"), PIPELINE_WITH_STEPS_JS);

      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toHaveLength(1);
      expect(specs[0]?.steps).toHaveLength(1);
      expect(specs[0]?.steps[0]).toMatchObject({
        stepKey: "evaluate-clarity",
        position: 1,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loads multiple pipeline files and returns all specs", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, "pipeline-a.js"),
        `export default { key: "pipeline-a", name: "Pipeline A", version: 1, status: "active", steps: [] };`,
      );
      writeFileSync(
        join(dir, "pipeline-b.js"),
        `export default { key: "pipeline-b", name: "Pipeline B", version: 2, status: "draft", steps: [] };`,
      );

      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toHaveLength(2);
      const keys = specs.map((s) => s.key).sort();
      expect(keys).toEqual(["pipeline-a", "pipeline-b"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("silently skips a file whose default export is a step definition (not a pipeline)", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "step-def.js"), STEP_DEF_JS);

      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("silently skips a file with a null default export", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "null-export.js"), `export default null;`);

      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("silently skips a file with no default export", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "no-default.js"), `export const foo = 42;`);

      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("silently skips an object missing the required steps array", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, "missing-steps.js"),
        `export default { key: "my-pipeline", name: "My Pipeline", version: 1 };`,
      );

      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loads the pipeline default export from a mixed file that also exports step definitions", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "mixed.js"), MIXED_FILE_JS);

      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toHaveLength(1);
      expect(specs[0]).toMatchObject({
        key: "my-pipeline",
        name: "My Pipeline",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skips non-source files and only loads pipelines from .js and .ts files", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "README.md"), "# Notes");
      writeFileSync(join(dir, "pipeline.js"), VALID_PIPELINE_JS);
      writeFileSync(join(dir, "notes.txt"), "some notes");

      const specs = await loadPipelinesFromDirectory(dir);
      expect(specs).toHaveLength(1);
      expect(specs[0]?.key).toBe("investigation");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
