import type { AnyJsonObject, AnyJsonValue } from "../../../common/contracts/json";

export const PROJECT_OPENCODE_RUNTIME_METADATA_KEY = "projectOpencode";

export type ProjectOpencodeRuntimeDefinitionKind = "command" | "service";

export type ProjectOpencodeRuntimeMetadata = {
  definitionKind: ProjectOpencodeRuntimeDefinitionKind;
  definitionName: string;
  definitionDescription: string;
  cwd: string | null;
};

const isJsonObject = (
  value: AnyJsonValue | undefined,
): value is AnyJsonObject =>
  value !== null && value !== undefined && !Array.isArray(value) && typeof value === "object";

const readOptionalString = (
  object: AnyJsonObject,
  key: string,
): string | null => {
  const value = object[key];
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

export const getProjectOpencodeRuntimeMetadata = (
  metadata: AnyJsonObject,
): ProjectOpencodeRuntimeMetadata | null => {
  const value = metadata[PROJECT_OPENCODE_RUNTIME_METADATA_KEY];
  if (!isJsonObject(value)) {
    return null;
  }

  const definitionKind = readOptionalString(value, "definitionKind");
  const definitionName = readOptionalString(value, "definitionName");
  const definitionDescription = readOptionalString(value, "definitionDescription");
  const cwd = readOptionalString(value, "cwd");

  if (
    (definitionKind !== "command" && definitionKind !== "service") ||
    !definitionName ||
    !definitionDescription
  ) {
    return null;
  }

  return {
    definitionKind,
    definitionName,
    definitionDescription,
    cwd,
  };
};

export const setProjectOpencodeRuntimeMetadata = (input: {
  metadata: AnyJsonObject;
  definitionKind: ProjectOpencodeRuntimeDefinitionKind;
  definitionName: string;
  definitionDescription: string;
  cwd: string | null;
}): AnyJsonObject => ({
  ...input.metadata,
  [PROJECT_OPENCODE_RUNTIME_METADATA_KEY]: {
    definitionKind: input.definitionKind,
    definitionName: input.definitionName,
    definitionDescription: input.definitionDescription,
    cwd: input.cwd,
  },
});
