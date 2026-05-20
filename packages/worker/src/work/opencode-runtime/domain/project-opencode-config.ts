import type { AnyJsonObject } from "../../../common/contracts/json";
import {
  CoreValidationError,
  InvariantViolationError,
} from "../../../lib/errors";

export const PROJECT_OPENCODE_CONFIG_VERSION = 1;
export const PROJECT_OPENCODE_COMMAND_DEPENDENCY_PREFIX = "command:";
export const PROJECT_OPENCODE_RUNTIME_PROTOCOLS = ["tcp", "http"] as const;
export const PROJECT_OPENCODE_CONFIG_RELATIVE_PATH = ".boboddy/boboddy.jsonc";
export const PROJECT_OPENCODE_CONFIG_SCHEMA_URL =
  "https://boboddy.dev/schemas/opencode.json";

export type ProjectOpencodeRuntimeProtocol =
  (typeof PROJECT_OPENCODE_RUNTIME_PROTOCOLS)[number];

export type ProjectOpencodeCommandDependencyRef =
  `${typeof PROJECT_OPENCODE_COMMAND_DEPENDENCY_PREFIX}${string}`;

export type ProjectOpencodeCommandDefinition = {
  name: string;
  description: string;
  run: string;
  cwd: string | null;
};

export type ProjectOpencodeServiceDefinition = {
  name: string;
  description: string;
  run: string;
  cwd: string | null;
  dependsOn: ProjectOpencodeCommandDependencyRef[];
  expose: {
    targetPort: number;
    protocol: ProjectOpencodeRuntimeProtocol;
  };
  healthcheck: {
    protocol: ProjectOpencodeRuntimeProtocol;
    path: string | null;
    expectedStatus: number | null;
  };
};

export type ProjectOpencodeConfigProps = {
  schemaUrl: string | null;
  commands: readonly ProjectOpencodeCommandDefinition[];
  services: readonly ProjectOpencodeServiceDefinition[];
};

type CreateProjectOpencodeConfigInput = {
  $schema?: string | null | undefined;
  version: number;
  commands?: Record<string, AnyJsonObject> | null | undefined;
  services?: Record<string, AnyJsonObject> | null | undefined;
};

const normalizeTrimmedText = (input: {
  value: unknown;
  fieldName: string;
  errorCode: string;
}): string => {
  if (typeof input.value !== "string") {
    throw new CoreValidationError(
      `${input.fieldName} must be a string`,
      input.errorCode,
    );
  }

  const normalizedValue = input.value.trim();
  if (!normalizedValue) {
    throw new CoreValidationError(
      `${input.fieldName} is required`,
      input.errorCode,
    );
  }

  return normalizedValue;
};

const normalizeOptionalCwd = (value: unknown, fieldName: string): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = normalizeTrimmedText({
    value,
    fieldName,
    errorCode: "PROJECT_OPENCODE_CONFIG_CWD_INVALID",
  });
  if (normalizedValue.startsWith("/")) {
    throw new CoreValidationError(
      `${fieldName} must be repo-relative`,
      "PROJECT_OPENCODE_CONFIG_CWD_ABSOLUTE",
    );
  }

  return normalizedValue === "." ? "." : normalizedValue.replace(/\/$/u, "");
};

const normalizeTargetPort = (value: unknown, fieldName: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 65_535
  ) {
    throw new CoreValidationError(
      `${fieldName} must be an integer between 1 and 65535`,
      "PROJECT_OPENCODE_CONFIG_PORT_INVALID",
    );
  }

  return value;
};

const normalizeProtocol = (value: unknown, fieldName: string): ProjectOpencodeRuntimeProtocol => {
  if (
    typeof value !== "string" ||
    !(PROJECT_OPENCODE_RUNTIME_PROTOCOLS as readonly string[]).includes(value)
  ) {
    throw new CoreValidationError(
      `${fieldName} must be one of: ${PROJECT_OPENCODE_RUNTIME_PROTOCOLS.join(", ")}`,
      "PROJECT_OPENCODE_CONFIG_PROTOCOL_INVALID",
    );
  }

  return value as ProjectOpencodeRuntimeProtocol;
};

const normalizeDependencyRef = (value: unknown): ProjectOpencodeCommandDependencyRef => {
  const normalizedValue = normalizeTrimmedText({
    value,
    fieldName: "dependsOn entry",
    errorCode: "PROJECT_OPENCODE_CONFIG_DEPENDS_ON_INVALID",
  });

  const withPrefix = normalizedValue.startsWith(
    PROJECT_OPENCODE_COMMAND_DEPENDENCY_PREFIX,
  )
    ? normalizedValue
    : `${PROJECT_OPENCODE_COMMAND_DEPENDENCY_PREFIX}${normalizedValue}`;

  const dependencyName = withPrefix.slice(
    PROJECT_OPENCODE_COMMAND_DEPENDENCY_PREFIX.length,
  );
  if (!dependencyName) {
    throw new CoreValidationError(
      "dependsOn entries must include a command name",
      "PROJECT_OPENCODE_CONFIG_DEPENDS_ON_NAME_REQUIRED",
    );
  }

  return withPrefix as ProjectOpencodeCommandDependencyRef;
};

const normalizeDescription = (value: unknown, fieldName: string): string =>
  normalizeTrimmedText({ value, fieldName, errorCode: "PROJECT_OPENCODE_CONFIG_DESCRIPTION_REQUIRED" });

const normalizeRun = (value: unknown, fieldName: string): string =>
  normalizeTrimmedText({ value, fieldName, errorCode: "PROJECT_OPENCODE_CONFIG_RUN_REQUIRED" });

const normalizeCommands = (
  value: Record<string, AnyJsonObject> | null | undefined,
): ProjectOpencodeCommandDefinition[] => {
  if (!value) {
    return [];
  }

  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, definition]) => ({
      name,
      description: normalizeDescription(
        definition["description"],
        `commands.${name}.description`,
      ),
      run: normalizeRun(definition["run"], `commands.${name}.run`),
      cwd: normalizeOptionalCwd(definition["cwd"], `commands.${name}.cwd`),
    }));
};

const normalizeHealthcheckPath = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = normalizeTrimmedText({
    value,
    fieldName: "healthcheck.path",
    errorCode: "PROJECT_OPENCODE_CONFIG_HEALTHCHECK_PATH_INVALID",
  });
  return normalizedValue.startsWith("/")
    ? normalizedValue
    : `/${normalizedValue}`;
};

const normalizeExpectedStatus = (value: unknown): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 100 ||
    value > 599
  ) {
    throw new CoreValidationError(
      "healthcheck.expectedStatus must be an integer between 100 and 599",
      "PROJECT_OPENCODE_CONFIG_HEALTHCHECK_STATUS_INVALID",
    );
  }

  return value;
};

const normalizeServices = (
  value: Record<string, AnyJsonObject> | null | undefined,
): ProjectOpencodeServiceDefinition[] => {
  if (!value) {
    return [];
  }

  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, definition]) => {
      const expose = definition["expose"];
      if (!expose || typeof expose !== "object" || Array.isArray(expose)) {
        throw new CoreValidationError(
          `services.${name}.expose must be an object`,
          "PROJECT_OPENCODE_CONFIG_EXPOSE_REQUIRED",
        );
      }

      const healthcheck = definition["healthcheck"];
      if (
        !healthcheck ||
        typeof healthcheck !== "object" ||
        Array.isArray(healthcheck)
      ) {
        throw new CoreValidationError(
          `services.${name}.healthcheck must be an object`,
          "PROJECT_OPENCODE_CONFIG_HEALTHCHECK_REQUIRED",
        );
      }

      const dependsOnValue = definition["dependsOn"];
      const dependsOn = Array.isArray(dependsOnValue)
        ? [
            ...new Set(
              dependsOnValue.map((entry) => normalizeDependencyRef(entry)),
            ),
          ].sort((left, right) => left.localeCompare(right))
        : dependsOnValue === undefined
          ? []
          : (() => {
              throw new CoreValidationError(
                `services.${name}.dependsOn must be an array`,
                "PROJECT_OPENCODE_CONFIG_DEPENDS_ON_ARRAY_REQUIRED",
              );
            })();

      const exposeObject = expose as Record<string, unknown>;
      const healthcheckObject = healthcheck as Record<string, unknown>;
      const healthcheckProtocol = normalizeProtocol(
        healthcheckObject["protocol"],
        `services.${name}.healthcheck.protocol`,
      );

      return {
        name,
        description: normalizeDescription(
          definition["description"],
          `services.${name}.description`,
        ),
        run: normalizeRun(definition["run"], `services.${name}.run`),
        cwd: normalizeOptionalCwd(definition["cwd"], `services.${name}.cwd`),
        dependsOn,
        expose: {
          targetPort: normalizeTargetPort(
            exposeObject["targetPort"],
            `services.${name}.expose.targetPort`,
          ),
          protocol: normalizeProtocol(
            exposeObject["protocol"],
            `services.${name}.expose.protocol`,
          ),
        },
        healthcheck: {
          protocol: healthcheckProtocol,
          path: normalizeHealthcheckPath(healthcheckObject["path"]),
          expectedStatus: normalizeExpectedStatus(
            healthcheckObject["expectedStatus"],
          ),
        },
      } satisfies ProjectOpencodeServiceDefinition;
    });
};

const assertDependencyInvariants = (input: {
  commands: readonly ProjectOpencodeCommandDefinition[];
  services: readonly ProjectOpencodeServiceDefinition[];
}) => {
  const commandNames = new Set(input.commands.map((command) => command.name));

  for (const service of input.services) {
    for (const dependencyRef of service.dependsOn) {
      const dependencyName = dependencyRef.slice(
        PROJECT_OPENCODE_COMMAND_DEPENDENCY_PREFIX.length,
      );
      if (!commandNames.has(dependencyName)) {
        throw new InvariantViolationError(
          `Service ${service.name} depends on missing command ${dependencyName}`,
          "PROJECT_OPENCODE_CONFIG_DEPENDENCY_MISSING",
        );
      }
    }

    if (service.expose.protocol === "tcp") {
      if (service.healthcheck.path !== null) {
        throw new InvariantViolationError(
          `TCP service ${service.name} cannot define a healthcheck path`,
          "PROJECT_OPENCODE_CONFIG_TCP_HEALTHCHECK_PATH_INVALID",
        );
      }
      if (service.healthcheck.expectedStatus !== null) {
        throw new InvariantViolationError(
          `TCP service ${service.name} cannot define an expected HTTP status`,
          "PROJECT_OPENCODE_CONFIG_TCP_HEALTHCHECK_STATUS_INVALID",
        );
      }
    }

    if (service.healthcheck.protocol !== service.expose.protocol) {
      throw new InvariantViolationError(
        `Service ${service.name} must use the same protocol for expose and healthcheck`,
        "PROJECT_OPENCODE_CONFIG_PROTOCOL_MISMATCH",
      );
    }
  }
};

export class ProjectOpencodeConfig {
  public readonly schemaUrl: string | null;
  public readonly commands: readonly ProjectOpencodeCommandDefinition[];
  public readonly services: readonly ProjectOpencodeServiceDefinition[];

  private constructor(props: ProjectOpencodeConfigProps) {
    assertDependencyInvariants({
      commands: props.commands,
      services: props.services,
    });
    this.schemaUrl = props.schemaUrl;
    this.commands = props.commands;
    this.services = props.services;
  }

  static create(
    input: CreateProjectOpencodeConfigInput,
  ): ProjectOpencodeConfig {
    if (input.version !== PROJECT_OPENCODE_CONFIG_VERSION) {
      throw new CoreValidationError(
        `Project OpenCode config version must be ${String(PROJECT_OPENCODE_CONFIG_VERSION)}`,
        "PROJECT_OPENCODE_CONFIG_VERSION_UNSUPPORTED",
      );
    }

    return new ProjectOpencodeConfig({
      schemaUrl:
        input.$schema === undefined || input.$schema === null
          ? null
          : normalizeTrimmedText({
              value: input.$schema,
              fieldName: "$schema",
              errorCode: "PROJECT_OPENCODE_CONFIG_SCHEMA_INVALID",
            }),
      commands: normalizeCommands(input.commands),
      services: normalizeServices(input.services),
    });
  }

  listDefinitions(): Array<
    | ({ kind: "command" } & ProjectOpencodeCommandDefinition)
    | ({ kind: "service" } & ProjectOpencodeServiceDefinition)
  > {
    return [
      ...this.commands.map((command) => ({
        kind: "command" as const,
        ...command,
      })),
      ...this.services.map((service) => ({
        kind: "service" as const,
        ...service,
      })),
    ];
  }

  getCommand(name: string): ProjectOpencodeCommandDefinition | null {
    return this.commands.find((command) => command.name === name) ?? null;
  }

  getService(name: string): ProjectOpencodeServiceDefinition | null {
    return this.services.find((service) => service.name === name) ?? null;
  }

  getServiceCommandDependencies(
    serviceName: string,
  ): ProjectOpencodeCommandDefinition[] {
    const service = this.getService(serviceName);
    if (!service) {
      throw new CoreValidationError(
        `Unknown project OpenCode service: ${serviceName}`,
        "PROJECT_OPENCODE_SERVICE_NOT_FOUND",
      );
    }

    return service.dependsOn.map((dependencyRef) => {
      const dependencyName = dependencyRef.slice(
        PROJECT_OPENCODE_COMMAND_DEPENDENCY_PREFIX.length,
      );
      const command = this.getCommand(dependencyName);
      if (!command) {
        throw new InvariantViolationError(
          `Service ${serviceName} depends on missing command ${dependencyName}`,
          "PROJECT_OPENCODE_SERVICE_DEPENDENCY_MISSING",
        );
      }

      return command;
    });
  }
}

export type ProjectOpencodeDefinition = ReturnType<ProjectOpencodeConfig["listDefinitions"]>[number];
