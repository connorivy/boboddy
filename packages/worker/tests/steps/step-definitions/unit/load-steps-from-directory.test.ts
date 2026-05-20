import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStepsFromDirectory } from "../../../../src/steps/step-definitions/application/load-steps-from-directory";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "step-loader-test-"));
}

// A valid StepDefinitionSpec-shaped object for use in temp files.
// These files don't import from @boboddy/sdk because temp files are outside
// the workspace and can't resolve workspace packages. The loader validates
// shape, not origin — defineStep() is tested separately.
const VALID_STEP_JS = `
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

describe("loadStepsFromDirectory", () => {
  test("returns an empty array for a directory with no .ts or .js files", async () => {
    const dir = makeTempDir();
    try {
      const specs = await loadStepsFromDirectory(dir);
      expect(specs).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ignores non-TypeScript and non-JavaScript files", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "README.md"), "# Steps");
      writeFileSync(join(dir, "config.json"), "{}");
      writeFileSync(join(dir, ".gitignore"), "*");

      const specs = await loadStepsFromDirectory(dir);
      expect(specs).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loads a valid step from a .js file", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "evaluate-clarity.js"), VALID_STEP_JS);

      const specs = await loadStepsFromDirectory(dir);
      expect(specs).toHaveLength(1);
      expect(specs[0]).toMatchObject({
        key: "evaluate-clarity",
        name: "Evaluate Clarity",
        version: 1,
        kind: "user_defined",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loads multiple step files and returns all specs", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "step-a.js"), `
        export default {
          key: "step-a", name: "Step A", version: 1, kind: "user_defined",
          status: "active", description: null, prompt: null,
          inputSchemaJson: null, resultSchemaJson: null,
          signalExtractorDefinitions: [], computedSignalDefinitions: [], opencodeMcpJson: null,
        };
      `);
      writeFileSync(join(dir, "step-b.js"), `
        export default {
          key: "step-b", name: "Step B", version: 2, kind: "user_defined",
          status: "active", description: null, prompt: null,
          inputSchemaJson: null, resultSchemaJson: null,
          signalExtractorDefinitions: [], computedSignalDefinitions: [], opencodeMcpJson: null,
        };
      `);

      const specs = await loadStepsFromDirectory(dir);
      expect(specs).toHaveLength(2);
      const keys = specs.map((s) => s.key).sort();
      expect(keys).toEqual(["step-a", "step-b"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws with the filename when default export is not a valid spec", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "bad-step.js"), `export default { notValid: true };`);

      let threw = false;
      try {
        await loadStepsFromDirectory(dir);
      } catch (error) {
        threw = true;
        expect((error as Error).message).toContain("bad-step.js");
      }
      expect(threw).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws when the default export is missing the key field", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "missing-key.js"), `
        export default { name: "No Key", version: 1, kind: "user_defined" };
      `);

      let threw = false;
      try {
        await loadStepsFromDirectory(dir);
      } catch (error) {
        threw = true;
        expect((error as Error).message).toContain("missing-key.js");
      }
      expect(threw).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws when the default export is missing the kind field", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "missing-kind.js"), `
        export default { key: "my-step", name: "My Step", version: 1 };
      `);

      let threw = false;
      try {
        await loadStepsFromDirectory(dir);
      } catch (error) {
        threw = true;
        expect((error as Error).message).toContain("missing-kind.js");
      }
      expect(threw).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws when the default export is null", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "null-export.js"), `export default null;`);

      let threw = false;
      try {
        await loadStepsFromDirectory(dir);
      } catch (error) {
        threw = true;
        expect((error as Error).message).toContain("null-export.js");
      }
      expect(threw).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws when there is no default export", async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, "no-default.js"), `export const foo = 42;`);

      let threw = false;
      try {
        await loadStepsFromDirectory(dir);
      } catch (error) {
        threw = true;
        expect((error as Error).message).toContain("no-default.js");
      }
      expect(threw).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
