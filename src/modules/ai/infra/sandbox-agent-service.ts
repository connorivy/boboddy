import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { v7 as uuidv7 } from "uuid";
import {
  sandboxAgentRunRequestSchema,
  sandboxAgentRunResponseSchema,
  type SandboxAgentRunRequest,
  type SandboxAgentRunResponse,
} from "@/modules/ai/contracts/sandbox-agent-run-contracts";

type SandboxAgentRunStatus = "queued" | "running" | "completed" | "failed";

export type SandboxAgentRunRecord = {
  runId: string;
  status: SandboxAgentRunStatus;
  request: SandboxAgentRunRequest;
  createdAt: string;
  updatedAt: string;
  failureReason?: string;
};

type ExecuteSandboxRunInput = {
  runId: string;
  request: SandboxAgentRunRequest;
};

export interface SandboxAgentRunner {
  execute(input: ExecuteSandboxRunInput): Promise<void>;
}

class NoopSandboxAgentRunner implements SandboxAgentRunner {
  async execute(): Promise<void> {
    throw new Error(
      "Sandbox runner is not configured. Set SANDBOX_RUNNER_MODE=docker_compose to enable execution.",
    );
  }
}

class DockerComposeSandboxAgentRunner implements SandboxAgentRunner {
  private readonly composeFile = getRequiredEnv("SANDBOX_DOCKER_COMPOSE_FILE");
  private readonly composeService = getRequiredEnv(
    "SANDBOX_DOCKER_COMPOSE_SERVICE",
  );
  private readonly projectPrefix =
    process.env.SANDBOX_DOCKER_COMPOSE_PROJECT_PREFIX?.trim() ||
    "boboddy-sandbox";
  private readonly runsDir =
    process.env.SANDBOX_RUNS_DIR?.trim() ||
    join(tmpdir(), "boboddy-sandbox-runs");

  async execute(input: ExecuteSandboxRunInput): Promise<void> {
    await mkdir(this.runsDir, { recursive: true });
    const runDir = join(this.runsDir, input.runId);
    await mkdir(runDir, { recursive: true });

    const requestPath = join(runDir, "request.json");
    await writeFile(requestPath, JSON.stringify(input.request, null, 2));

    const projectName = `${this.projectPrefix}-${input.runId}`;
    const requestPayload = Buffer.from(
      JSON.stringify(input.request),
      "utf8",
    ).toString("base64");

    await runCommand(
      "docker",
      [
        "compose",
        "-f",
        this.composeFile,
        "-p",
        projectName,
        "run",
        "--rm",
        "-e",
        `SANDBOX_RUN_ID=${input.runId}`,
        "-e",
        `SANDBOX_RUN_REQUEST_B64=${requestPayload}`,
        this.composeService,
      ],
      runDir,
    );
  }
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function parsePort(rawValue: string | undefined): number {
  if (!rawValue) {
    return 4000;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4000;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  if (body.length === 0) {
    return {};
  }

  return JSON.parse(body);
}

function writeJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

function hasValidBearerToken(request: IncomingMessage): boolean {
  const expectedToken = process.env.SANDBOX_AGENT_TOKEN?.trim();
  if (!expectedToken) {
    return true;
  }

  const authorization = request.headers.authorization;
  return authorization === `Bearer ${expectedToken}`;
}

function createSandboxAgentRunner(): SandboxAgentRunner {
  const mode = process.env.SANDBOX_RUNNER_MODE?.trim().toLowerCase();

  if (mode === "docker_compose") {
    return new DockerComposeSandboxAgentRunner();
  }

  return new NoopSandboxAgentRunner();
}

export class SandboxAgentService {
  private readonly runs = new Map<string, SandboxAgentRunRecord>();

  constructor(private readonly runner: SandboxAgentRunner) {}

  createRun(rawRequest: unknown): SandboxAgentRunResponse {
    const request = sandboxAgentRunRequestSchema.parse(rawRequest);
    const runId = uuidv7();
    const now = new Date().toISOString();
    const record: SandboxAgentRunRecord = {
      runId,
      request,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(runId, record);
    void this.executeRun(record);

    return sandboxAgentRunResponseSchema.parse({ runId });
  }

  getRun(runId: string): SandboxAgentRunRecord | null {
    return this.runs.get(runId) ?? null;
  }

  private async executeRun(record: SandboxAgentRunRecord): Promise<void> {
    this.updateRun(record.runId, { status: "running" });

    try {
      await this.runner.execute({
        runId: record.runId,
        request: record.request,
      });
      this.updateRun(record.runId, { status: "completed" });
    } catch (error) {
      this.updateRun(record.runId, {
        status: "failed",
        failureReason:
          error instanceof Error ? error.message : "Unknown sandbox failure",
      });
    }
  }

  private updateRun(
    runId: string,
    update: Pick<SandboxAgentRunRecord, "status"> &
      Partial<Pick<SandboxAgentRunRecord, "failureReason">>,
  ): void {
    const current = this.runs.get(runId);
    if (!current) {
      return;
    }

    this.runs.set(runId, {
      ...current,
      ...update,
      updatedAt: new Date().toISOString(),
    });
  }
}

export function startSandboxAgentService(): void {
  const enabled = process.env.SANDBOX_SERVICE_ENABLED?.trim().toLowerCase();
  if (enabled !== "true") {
    return;
  }

  const service = new SandboxAgentService(createSandboxAgentRunner());
  const port = parsePort(process.env.SANDBOX_AGENT_PORT);

  const server = createServer(async (request, response) => {
    if (!hasValidBearerToken(request)) {
      writeJson(response, 401, { error: "Unauthorized" });
      return;
    }

    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (method === "POST" && url.pathname === "/agent-runs") {
        const body = await readJsonBody(request);
        const createdRun = service.createRun(body);
        writeJson(response, 202, createdRun);
        return;
      }

      if (method === "GET" && url.pathname.startsWith("/agent-runs/")) {
        const runId = url.pathname.slice("/agent-runs/".length);
        const run = service.getRun(runId);
        if (!run) {
          writeJson(response, 404, { error: "Run not found" });
          return;
        }

        writeJson(response, 200, run);
        return;
      }

      writeJson(response, 404, { error: "Not found" });
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : 500;
      writeJson(response, status, {
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  server.listen(port, () => {
    console.log(`[sandbox-service] listening on port ${port}`);
  });
}

export const sandboxAgentServiceInternals = {
  DockerComposeSandboxAgentRunner,
  NoopSandboxAgentRunner,
};
