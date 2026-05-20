import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RuntimeServiceAccessPoint } from "../domain/runtime-service-access-point";
import type { RuntimeServiceHealthcheck } from "../domain/runtime-service-healthcheck";
import type { Logger } from "../../../lib/logger";

const execFileAsync = promisify(execFile);

export const READY_CHECK_SCRIPT = `const mode = process.argv[1];
if (mode === "http") {
  const [url, timeoutMs, expectedStatus] = process.argv.slice(2);
  const http = require("node:http");
  const { URL } = require("node:url");
  const targetUrl = new URL(url);
  const request = http.request(
    targetUrl,
    {
      method: "GET",
      timeout: Number(timeoutMs),
    },
    (response) => {
      response.resume();
      response.on("end", () => {
        if (response.statusCode === Number(expectedStatus)) {
          process.exit(0);
        }
        console.error(
          "HTTP readiness probe expected status",
          expectedStatus,
          "but received",
          response.statusCode,
          "for",
          url,
        );
        process.exit(1);
      });
    },
  );
  request.on("timeout", () => {
    console.error("HTTP readiness probe timed out for", url);
    request.destroy();
    process.exit(1);
  });
  request.on("error", (error) => {
    console.error("HTTP readiness probe request failed for", url, error?.message ?? String(error));
    process.exit(1);
  });
  request.end();
} else {
  const net = require("node:net");
  const [host, port, timeoutMs] = process.argv.slice(2);
  const socket = net.connect({ host, port: Number(port) });
  socket.setTimeout(Number(timeoutMs));
  socket.on("connect", () => {
    socket.destroy();
    process.exit(0);
  });
  socket.on("timeout", () => {
    console.error("TCP readiness probe timed out for", host + ":" + port);
    socket.destroy();
    process.exit(1);
  });
  socket.on("error", (error) => {
    console.error("TCP readiness probe connection failed for", host + ":" + port, error?.message ?? String(error));
    process.exit(1);
  });
}
`;

const RUNTIME_SERVICE_PROBE_OUTPUT_PREVIEW_LIMIT = 1_000;

export type ReadinessProbeFailure = {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  reason: string;
};

export const buildProbeOutputPreview = (value: string) =>
  value.length <= RUNTIME_SERVICE_PROBE_OUTPUT_PREVIEW_LIMIT
    ? value
    : value.slice(-RUNTIME_SERVICE_PROBE_OUTPUT_PREVIEW_LIMIT);

export const formatReadinessTarget = (input: {
  healthcheck: RuntimeServiceHealthcheck;
  accessPoint: RuntimeServiceAccessPoint;
  checkHost: string;
}) =>
  input.healthcheck.protocolKind === "http"
    ? `${input.accessPoint.protocol}://${input.checkHost}:${String(input.accessPoint.port)}${input.healthcheck.path ?? "/"}`
    : `${input.checkHost}:${String(input.accessPoint.port)}`;

export const summarizeReadinessProbeFailure = (
  failure: ReadinessProbeFailure,
) => ({
  exitCode: failure.exitCode,
  signal: failure.signal,
  reason: failure.reason,
  stdoutPreview: buildProbeOutputPreview(failure.stdout),
  stderrPreview: buildProbeOutputPreview(failure.stderr),
});

export async function runReadinessProbe(input: {
  healthcheck: RuntimeServiceHealthcheck;
  accessPoint: RuntimeServiceAccessPoint;
  checkContainerId: string;
  checkHost: string;
}): Promise<{ succeeded: true } | { succeeded: false; failure: ReadinessProbeFailure }> {
  const args =
    input.healthcheck.protocolKind === "http"
      ? [
          "node",
          "-e",
          READY_CHECK_SCRIPT,
          "http",
          `${input.accessPoint.protocol}://${input.checkHost}:${String(input.accessPoint.port)}${input.healthcheck.path ?? "/"}`,
          String(input.healthcheck.timeoutMs),
          String(input.healthcheck.expectedStatus ?? 200),
        ]
      : [
          "node",
          "-e",
          READY_CHECK_SCRIPT,
          "tcp",
          input.checkHost,
          String(input.accessPoint.port),
          String(input.healthcheck.timeoutMs),
        ];

  try {
    await execFileAsync("docker", ["exec", input.checkContainerId, ...args]);
    return { succeeded: true };
  } catch (error) {
    const stdout =
      typeof error === "object" &&
      error !== null &&
      "stdout" in error &&
      typeof error.stdout === "string"
        ? error.stdout
        : "";
    const stderr =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string"
        ? error.stderr
        : "";
    const exitCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "number"
        ? error.code
        : null;
    const signal =
      typeof error === "object" &&
      error !== null &&
      "signal" in error &&
      typeof error.signal === "string"
        ? error.signal
        : null;

    return {
      succeeded: false,
      failure: {
        exitCode,
        signal,
        stdout,
        stderr,
        reason:
          stderr.trim() ||
          stdout.trim() ||
          (error instanceof Error ? error.message : String(error)),
      },
    };
  }
}

export async function waitForReady(input: {
  healthcheck: RuntimeServiceHealthcheck;
  accessPoint: RuntimeServiceAccessPoint;
  checkContainerId: string;
  checkHost: string;
  log: Logger;
}): Promise<void> {
  const attempts = Math.max(1, input.healthcheck.retries);
  const target = formatReadinessTarget(input);
  let lastFailure: ReadinessProbeFailure | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    input.log.debug(
      {
        attempt: attempt + 1,
        attempts,
        protocol: input.healthcheck.protocolKind,
        target,
      },
      "runtime service healthcheck attempt",
    );
    const probe = await runReadinessProbe(input);
    if (probe.succeeded) {
      return;
    }
    lastFailure = probe.failure;
    input.log.warn(
      {
        attempt: attempt + 1,
        attempts,
        protocol: input.healthcheck.protocolKind,
        target,
        failure: summarizeReadinessProbeFailure(probe.failure),
      },
      "runtime service healthcheck failed",
    );

    if (attempt < attempts - 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, input.healthcheck.intervalMs);
      });
    }
  }

  const reason = lastFailure?.reason ?? "probe exited unsuccessfully";
  throw new Error(
    `Runtime service ${target} failed readiness checks after ${String(attempts)} attempts: ${reason}`,
  );
}
