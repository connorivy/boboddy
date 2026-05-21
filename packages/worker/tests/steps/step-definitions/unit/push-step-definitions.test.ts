import { describe, expect, test, vi } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pushStepDefinitions, STEPS_DIR } from "../../../../src/steps/step-definitions/application/push-step-definitions";

function createLogger() {
  return {
    info: vi.fn(),
  };
}

describe("pushStepDefinitions", () => {
  test("skips quietly when the steps directory is missing and skipping is enabled", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "boboddy-push-steps-missing-"));

    try {
      const logger = createLogger();

      const result = await pushStepDefinitions({
        projectId: "project-1",
        baseUrl: "https://example.com",
        headers: { Authorization: "Bearer token" },
        logger,
        cwd,
        skipMissingDirectory: true,
      });

      expect(result).toEqual({
        found: 0,
        created: 0,
        updated: 0,
        skippedMissingDirectory: true,
      });
      expect(logger.info).not.toHaveBeenCalled();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("creates and updates step definitions from the local steps directory", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "boboddy-push-steps-"));
    mkdirSync(join(cwd, STEPS_DIR), { recursive: true });

    const logger = createLogger();
    const listByProjectId = vi.fn(() =>
      Promise.resolve([
        {
          id: "existing-id",
          key: "existing-step",
          version: 1,
        },
      ]),
    );
    const update = vi.fn(() => Promise.resolve(undefined));
    const create = vi.fn(() => Promise.resolve(undefined));

    try {
      const result = await pushStepDefinitions({
        projectId: "project-1",
        baseUrl: "https://example.com",
        headers: { Authorization: "Bearer token" },
        logger,
        cwd,
        loadSteps: vi.fn(() =>
          Promise.resolve([
            {
              key: "existing-step",
              name: "Existing Step",
              version: 1,
              kind: "user_defined" as const,
              status: "active" as const,
              description: null,
              prompt: "existing",
              inputSchemaJson: null,
              resultSchemaJson: null,
              signalExtractorDefinitions: [],
              computedSignalDefinitions: [],
              opencodeMcpJson: null,
            },
            {
              key: "new-step",
              name: "New Step",
              version: 2,
              kind: "user_defined" as const,
              status: "active" as const,
              description: null,
              prompt: "new",
              inputSchemaJson: null,
              resultSchemaJson: null,
              signalExtractorDefinitions: [],
              computedSignalDefinitions: [],
              opencodeMcpJson: null,
            },
          ]),
        ),
        createClient: vi.fn(() => ({
          listByProjectId,
          update,
          create,
        })),
      });

      expect(result).toEqual({
        found: 2,
        created: 1,
        updated: 1,
        skippedMissingDirectory: false,
      });
      expect(update).toHaveBeenCalledWith(
        "existing-id",
        expect.objectContaining({ key: "existing-step", projectId: "project-1" }),
        { headers: { Authorization: "Bearer token" } },
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ key: "new-step", projectId: "project-1" }),
        { headers: { Authorization: "Bearer token" } },
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
