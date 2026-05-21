import {
  createUuidV7,
  parseUuidV7,
  type UuidV7,
} from "../../../common/contracts/uuid-v7";
import type { AnyJsonObject } from "../../../common/contracts/json";
import {
  CoreValidationError,
  InvariantViolationError,
} from "../../../lib/errors";
import {
  RUNTIME_ENVIRONMENT_ROLES,
  type RuntimeEnvironmentRole,
} from "./runtime-environment";
import {
  createRuntimeServiceAccessPoint,
  type RuntimeServiceAccessPoint,
} from "./runtime-service-access-point";
import {
  createRuntimeServiceHealthcheck,
  type RuntimeServiceHealthcheck,
} from "./runtime-service-healthcheck";

export const RUNTIME_SERVICE_ENVIRONMENT_ROLES = RUNTIME_ENVIRONMENT_ROLES;
export type RuntimeServiceEnvironmentRole = RuntimeEnvironmentRole;

export const RUNTIME_SERVICE_STATUSES = [
  "queued",
  "starting",
  "ready",
  "stopping",
  "stopped",
  "failed",
] as const;
export type RuntimeServiceStatus = (typeof RUNTIME_SERVICE_STATUSES)[number];

export type RuntimeServiceEntityProps = {
  id: UuidV7;
  projectId: UuidV7;
  projectRuntimeSessionId: UuidV7;
  environmentRole: RuntimeServiceEnvironmentRole;
  command: string;
  status: RuntimeServiceStatus;
  healthcheck: RuntimeServiceHealthcheck;
  accessPoints?: RuntimeServiceAccessPoint[] | null | undefined;
  failureReason?: string | null | undefined;
  metadata?: AnyJsonObject | null | undefined;
  createdAt?: Date | string | null | undefined;
  startedAt?: Date | string | null | undefined;
  readyAt?: Date | string | null | undefined;
  stoppedAt?: Date | string | null | undefined;
  updatedAt?: Date | string | null | undefined;
};

export type CreateRuntimeServiceEntityProps = Omit<
  RuntimeServiceEntityProps,
  "id"
> & {
  id?: UuidV7 | undefined;
};

const normalizeDate = (
  value?: Date | string | null,
): Date | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new CoreValidationError(
      `Invalid runtime service date value: ${String(value)}`,
      "INVALID_RUNTIME_SERVICE_DATE",
    );
  }

  return parsed;
};

const normalizeOptionalText = (value?: string | null): string | null => {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : null;
};

const normalizeMetadata = (value?: AnyJsonObject | null): AnyJsonObject => value ?? {};

const normalizeAccessPoints = (
  accessPoints?: RuntimeServiceAccessPoint[] | null,
): RuntimeServiceAccessPoint[] =>
  (accessPoints ?? []).map((accessPoint) =>
    createRuntimeServiceAccessPoint(accessPoint),
  );

const normalizeHealthcheck = (
  healthcheck: RuntimeServiceHealthcheck,
): RuntimeServiceHealthcheck => createRuntimeServiceHealthcheck(healthcheck);

const assertStatusInvariants = (input: {
  status: RuntimeServiceStatus;
  startedAt: Date | null | undefined;
  readyAt: Date | null | undefined;
  stoppedAt: Date | null | undefined;
  failureReason: string | null;
  accessPoints: RuntimeServiceAccessPoint[];
}) => {
  if (
    (input.status === "starting" ||
      input.status === "ready" ||
      input.status === "stopping") &&
    !input.startedAt
  ) {
    throw new InvariantViolationError(
      `Runtime service status ${input.status} requires startedAt`,
      "RUNTIME_SERVICE_STARTED_AT_REQUIRED",
    );
  }

  if (input.status === "ready") {
    if (!input.readyAt) {
      throw new InvariantViolationError(
        "Ready runtime services require readyAt",
        "RUNTIME_SERVICE_READY_AT_REQUIRED",
      );
    }

    if (input.accessPoints.length === 0) {
      throw new InvariantViolationError(
        "Ready runtime services require at least one access point",
        "RUNTIME_SERVICE_ACCESS_POINT_REQUIRED",
      );
    }
  }

  if (input.status === "stopped" && !input.stoppedAt) {
    throw new InvariantViolationError(
      "Stopped runtime services require stoppedAt",
      "RUNTIME_SERVICE_STOPPED_AT_REQUIRED",
    );
  }

  if (input.status === "failed" && !input.failureReason) {
    throw new InvariantViolationError(
      "Failed runtime services require a failureReason",
      "RUNTIME_SERVICE_FAILURE_REASON_REQUIRED",
    );
  }
};

export class RuntimeServiceEntity {
  public readonly id: UuidV7;
  public readonly projectId: UuidV7;
  public readonly projectRuntimeSessionId: UuidV7;
  public readonly environmentRole: RuntimeServiceEnvironmentRole;
  public readonly command: string;
  public readonly status: RuntimeServiceStatus;
  public readonly healthcheck: RuntimeServiceHealthcheck;
  public readonly accessPoints: RuntimeServiceAccessPoint[];
  public readonly failureReason: string | null;
  public readonly metadata: AnyJsonObject;
  public readonly createdAt: Date | null | undefined;
  public readonly startedAt: Date | null | undefined;
  public readonly readyAt: Date | null | undefined;
  public readonly stoppedAt: Date | null | undefined;
  public readonly updatedAt: Date | null | undefined;

  private constructor(props: RuntimeServiceEntityProps) {
    const command = props.command.trim();
    if (!command) {
      throw new CoreValidationError(
        "Runtime service command is required",
        "RUNTIME_SERVICE_COMMAND_REQUIRED",
      );
    }

    const startedAt = normalizeDate(props.startedAt);
    const readyAt = normalizeDate(props.readyAt);
    const stoppedAt = normalizeDate(props.stoppedAt);
    const failureReason = normalizeOptionalText(props.failureReason);
    const accessPoints = normalizeAccessPoints(props.accessPoints);

    assertStatusInvariants({
      status: props.status,
      startedAt,
      readyAt,
      stoppedAt,
      failureReason,
      accessPoints,
    });

    this.id = parseUuidV7(props.id);
    this.projectId = parseUuidV7(props.projectId);
    this.projectRuntimeSessionId = parseUuidV7(props.projectRuntimeSessionId);
    this.environmentRole = props.environmentRole;
    this.command = command;
    this.status = props.status;
    this.healthcheck = normalizeHealthcheck(props.healthcheck);
    this.accessPoints = accessPoints;
    this.failureReason = failureReason;
    this.metadata = normalizeMetadata(props.metadata);
    this.createdAt = normalizeDate(props.createdAt);
    this.startedAt = startedAt;
    this.readyAt = readyAt;
    this.stoppedAt = stoppedAt;
    this.updatedAt = normalizeDate(props.updatedAt);
  }

  get isTerminal() {
    return this.status === "stopped" || this.status === "failed";
  }

  static createQueued(
    props: Omit<
      CreateRuntimeServiceEntityProps,
      | "status"
      | "accessPoints"
      | "failureReason"
      | "startedAt"
      | "readyAt"
      | "stoppedAt"
    > & {
      runtimeSessionIsActive: boolean;
    },
  ): RuntimeServiceEntity {
    if (!props.runtimeSessionIsActive) {
      throw new CoreValidationError(
        "Runtime services can only be created for active runtime sessions",
        "RUNTIME_SERVICE_SESSION_NOT_ACTIVE",
      );
    }

    return new RuntimeServiceEntity({
      ...props,
      id: props.id ?? createUuidV7(),
      status: "queued",
      accessPoints: [],
      failureReason: null,
      startedAt: null,
      readyAt: null,
      stoppedAt: null,
    });
  }

  static rehydrate(props: RuntimeServiceEntityProps): RuntimeServiceEntity {
    return new RuntimeServiceEntity(props);
  }

  markStarting(input: {
    startedAt: Date;
    metadata?: AnyJsonObject | undefined;
  }): RuntimeServiceEntity {
    if (this.status !== "queued") {
      throw new InvariantViolationError(
        `Runtime service ${this.id} cannot start from ${this.status}`,
        "RUNTIME_SERVICE_START_NOT_ALLOWED",
      );
    }

    return this.copy({
      status: "starting",
      startedAt: input.startedAt,
      failureReason: null,
      metadata: input.metadata ?? this.metadata,
      updatedAt: input.startedAt,
    });
  }

  markReady(input: {
    readyAt: Date;
    accessPoints: RuntimeServiceAccessPoint[];
    metadata?: AnyJsonObject | undefined;
  }): RuntimeServiceEntity {
    if (this.status !== "starting") {
      throw new InvariantViolationError(
        `Runtime service ${this.id} cannot become ready from ${this.status}`,
        "RUNTIME_SERVICE_READY_NOT_ALLOWED",
      );
    }

    return this.copy({
      status: "ready",
      accessPoints: input.accessPoints,
      readyAt: input.readyAt,
      failureReason: null,
      metadata: input.metadata ?? this.metadata,
      updatedAt: input.readyAt,
    });
  }

  markFailed(input: {
    failedAt: Date;
    reason: string;
    metadata?: AnyJsonObject | undefined;
  }): RuntimeServiceEntity {
    if (this.isTerminal) {
      throw new InvariantViolationError(
        `Runtime service ${this.id} cannot fail from ${this.status}`,
        "RUNTIME_SERVICE_FAIL_NOT_ALLOWED",
      );
    }

    const reason = input.reason.trim();
    if (!reason) {
      throw new CoreValidationError(
        "Runtime service failure reason is required",
        "RUNTIME_SERVICE_FAILURE_REASON_REQUIRED",
      );
    }

    return this.copy({
      status: "failed",
      failureReason: reason,
      metadata: input.metadata ?? this.metadata,
      updatedAt: input.failedAt,
    });
  }

  beginStopping(input: {
    stoppedAt: Date;
    metadata?: AnyJsonObject | undefined;
  }): RuntimeServiceEntity {
    if (this.status !== "starting" && this.status !== "ready") {
      throw new InvariantViolationError(
        `Runtime service ${this.id} cannot begin stopping from ${this.status}`,
        "RUNTIME_SERVICE_STOPPING_NOT_ALLOWED",
      );
    }

    return this.copy({
      status: "stopping",
      metadata: input.metadata ?? this.metadata,
      updatedAt: input.stoppedAt,
    });
  }

  markStopped(input: {
    stoppedAt: Date;
    metadata?: AnyJsonObject | undefined;
  }): RuntimeServiceEntity {
    if (this.status !== "stopping" && this.status !== "queued") {
      throw new InvariantViolationError(
        `Runtime service ${this.id} cannot stop from ${this.status}`,
        "RUNTIME_SERVICE_STOP_NOT_ALLOWED",
      );
    }

    return this.copy({
      status: "stopped",
      stoppedAt: input.stoppedAt,
      metadata: input.metadata ?? this.metadata,
      updatedAt: input.stoppedAt,
    });
  }

  toJSON(): RuntimeServiceEntityProps {
    return {
      id: this.id,
      projectId: this.projectId,
      projectRuntimeSessionId: this.projectRuntimeSessionId,
      environmentRole: this.environmentRole,
      command: this.command,
      status: this.status,
      healthcheck: this.healthcheck,
      accessPoints: this.accessPoints,
      failureReason: this.failureReason,
      metadata: this.metadata,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      readyAt: this.readyAt,
      stoppedAt: this.stoppedAt,
      updatedAt: this.updatedAt,
    };
  }

  private copy(
    override: Partial<RuntimeServiceEntityProps>,
  ): RuntimeServiceEntity {
    return new RuntimeServiceEntity({
      ...this.toJSON(),
      ...override,
    });
  }
}
