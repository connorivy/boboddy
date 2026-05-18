import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { StepDefinitionSpec } from "@boboddy/sdk/definitions/steps";

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

export async function loadStepsFromDirectory(
  dir: string,
): Promise<StepDefinitionSpec[]> {
  const absDir = resolve(dir);
  const entries = readdirSync(absDir);
  const stepFiles = entries.filter(
    (f) => f.endsWith(".ts") || f.endsWith(".js"),
  );

  if (stepFiles.length === 0) {
    return [];
  }

  const specs: StepDefinitionSpec[] = [];

  for (const file of stepFiles) {
    const absPath = join(absDir, file);
    const imported: unknown = await import(absPath);
    const mod = imported as { default: unknown };
    const spec = mod.default;

    if (!isStepDefinitionSpec(spec)) {
      throw new Error(
        `${file}: default export is not a valid StepDefinitionSpec. ` +
          `Make sure to export the result of defineStep() as the default export.`,
      );
    }

    specs.push(spec);
  }

  return specs;
}
