import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPipelineStepsFromDirectory } from "../../../../src/pipelines/pipeline-definitions/application/load-pipeline-steps-from-directory";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "pipeline-step-loader-test-"));
}

const MIXED_FILE_JS = `
export const investigate = {
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
  key: "investigation",
  name: "Investigation",
  version: 1,
  status: "active",
  steps: [],
};
`;

describe("loadPipelineStepsFromDirectory", () => {
  test("returns named step definition exports from mixed pipeline-builder files", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "example-pipeline.js"), MIXED_FILE_JS);

      const specs = await loadPipelineStepsFromDirectory(dir);
      expect(specs).toHaveLength(1);
      expect(specs[0]).toMatchObject({
        key: "investigate",
        name: "Investigate",
        version: 1,
        kind: "user_defined",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ignores default pipeline exports and unrelated named exports", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, "mixed.js"),
        `${MIXED_FILE_JS}\nexport const helper = 42;\nexport const notAStep = { key: "x" };\n`,
      );

      const specs = await loadPipelineStepsFromDirectory(dir);
      expect(specs).toHaveLength(1);
      expect(specs[0]?.key).toBe("investigate");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
