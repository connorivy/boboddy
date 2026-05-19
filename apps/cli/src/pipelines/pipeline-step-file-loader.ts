import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { StepDefinitionSpec } from "@boboddy/sdk/definitions/steps";
import { importUserModule } from "../lib/import-user-module";

function isStepDefinitionSpec(value: unknown): value is StepDefinitionSpec {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["key"] === "string" &&
    typeof obj["name"] === "string" &&
    typeof obj["version"] === "number" &&
    obj["kind"] === "user_defined"
  );
}

export async function loadPipelineStepsFromDirectory(
  dir: string,
): Promise<StepDefinitionSpec[]> {
  const absDir = resolve(dir);
  const entries = readdirSync(absDir);
  const sourceFiles = entries.filter(
    (f) => f.endsWith(".ts") || f.endsWith(".js"),
  );

  if (sourceFiles.length === 0) {
    return [];
  }

  const specs: StepDefinitionSpec[] = [];

  for (const file of sourceFiles) {
    const absPath = join(absDir, file);
    let imported: unknown;
    try {
      imported = await importUserModule(absPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("Cannot find module") ||
        message.includes("Cannot find package")
      ) {
        throw new Error(
          `Failed to import ${file}: ${message}\n\nRun \`npm install\` or \`bun install\` inside .boboddy/pipeline-builder/ to install dependencies first.`,
        );
      }
      throw err;
    }

    for (const [exportName, value] of Object.entries(imported as Record<string, unknown>)) {
      if (exportName === "default") {
        continue;
      }
      if (isStepDefinitionSpec(value)) {
        specs.push(value);
      }
    }
  }

  return specs;
}
