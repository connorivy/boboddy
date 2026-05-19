import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PipelineDefinitionSpec } from "@boboddy/sdk/definitions/pipelines";

function isPipelineDefinitionSpec(value: unknown): value is PipelineDefinitionSpec {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["key"] === "string" &&
    typeof obj["name"] === "string" &&
    typeof obj["version"] === "number" &&
    Array.isArray(obj["steps"])
  );
}

export async function loadPipelinesFromDirectory(
  dir: string,
): Promise<PipelineDefinitionSpec[]> {
  const absDir = resolve(dir);
  const entries = readdirSync(absDir);
  const sourceFiles = entries.filter(
    (f) => f.endsWith(".ts") || f.endsWith(".js"),
  );

  if (sourceFiles.length === 0) {
    return [];
  }

  const specs: PipelineDefinitionSpec[] = [];

  for (const file of sourceFiles) {
    const absPath = join(absDir, file);
    const imported: unknown = await import(absPath);
    const mod = imported as { default: unknown };
    const spec = mod.default;

    if (!isPipelineDefinitionSpec(spec)) {
      continue;
    }

    specs.push(spec);
  }

  return specs;
}
