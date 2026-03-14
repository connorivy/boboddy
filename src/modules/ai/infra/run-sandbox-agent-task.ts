import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import {
  sandboxAgentRunRequestSchema,
  type SandboxAgentRunRequest,
} from "@/modules/ai/contracts/sandbox-agent-run-contracts";
import { generateSandboxAgentPayload } from "@/modules/ai/infra/sandbox-agent-ai";

const INVESTIGATION_PAYLOAD_PATH =
  "tmp/copilot-ticket-investigation-webhook-payload.json";
const REPRO_PAYLOAD_PATH = "tmp/copilot-repro-webhook-payload.json";
const FIX_PAYLOAD_PATH = "tmp/copilot-fix-webhook-payload.json";

type AgentExecutionOutcome = {
  status: "complete" | "error";
  payload: Record<string, unknown>;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function parseRequestFromEnv(): SandboxAgentRunRequest {
  const requestB64 = getRequiredEnv("SANDBOX_RUN_REQUEST_B64");
  const requestJson = Buffer.from(requestB64, "base64").toString("utf8");
  return sandboxAgentRunRequestSchema.parse(JSON.parse(requestJson));
}

function getPayloadRelativePath(stepName: string): string {
  if (stepName === TICKET_INVESTIGATION_STEP_NAME) {
    return INVESTIGATION_PAYLOAD_PATH;
  }

  if (stepName === FAILING_TEST_REPRO_STEP_NAME) {
    return REPRO_PAYLOAD_PATH;
  }

  if (stepName === FAILING_TEST_FIX_STEP_NAME) {
    return FIX_PAYLOAD_PATH;
  }

  throw new Error(`Unsupported sandbox step "${stepName}"`);
}

async function ensureWorkspace(request: SandboxAgentRunRequest): Promise<string> {
  const runId = getRequiredEnv("SANDBOX_RUN_ID");
  const workspaceRoot = process.env.SANDBOX_WORKSPACE_ROOT?.trim() || "/tmp";
  const sourceRepoPath =
    process.env.SANDBOX_SOURCE_REPO_PATH?.trim() || "/workspace/source";
  const workspacePath = join(workspaceRoot, "sandbox-runs", runId, "workspace");

  await mkdir(dirname(workspacePath), { recursive: true });
  await cp(sourceRepoPath, workspacePath, {
    recursive: true,
    force: true,
    filter: (source) =>
      !source.includes("/node_modules/") &&
      !source.includes("/.next/") &&
      !source.includes("/.git/"),
  });

  const instructionsPath = join(workspacePath, "tmp", "sandbox-instructions.txt");
  await mkdir(dirname(instructionsPath), { recursive: true });
  await writeFile(instructionsPath, request.customInstructions, "utf8");

  return workspacePath;
}

function buildAgentBranch(request: SandboxAgentRunRequest): string {
  const prefix = process.env.SANDBOX_AGENT_BRANCH_PREFIX?.trim() || "sandbox";
  const ticketSlug = request.ticketId.replace(/[^A-Za-z0-9._-]/g, "-");
  return `${prefix}/${ticketSlug}/${getRequiredEnv("SANDBOX_RUN_ID")}`;
}

async function tryReadPayload(
  payloadAbsolutePath: string,
): Promise<Record<string, unknown> | null> {
  try {
    await stat(payloadAbsolutePath);
  } catch {
    return null;
  }

  const raw = await readFile(payloadAbsolutePath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function buildFallbackPayload(
  request: SandboxAgentRunRequest,
  failureReason: string,
): Record<string, unknown> {
  if (request.stepName === TICKET_INVESTIGATION_STEP_NAME) {
    return {
      operationOutcome: "agent_error",
      summaryOfInvestigation: "Sandbox agent run did not produce an investigation payload.",
      investigationReport: failureReason,
      whatHappened: "Sandbox execution did not complete successfully.",
      datadogQueryTerms: [],
      datadogTimeRange: null,
      keyIdentifiers: [request.ticketId],
      exactEventTimes: [],
      codeUnitsInvolved: [],
      databaseFindings: [],
      logFindings: [],
      datadogSessionFindings: [],
      investigationGaps: [failureReason],
      recommendedNextQueries: [],
      confidenceLevel: null,
      rawResultJson: {
        sandboxRunId: getRequiredEnv("SANDBOX_RUN_ID"),
        failureReason,
      },
    };
  }

  if (request.stepName === FAILING_TEST_REPRO_STEP_NAME) {
    return {
      reproduceOperationOutcome: "agent_error",
      summaryOfFindings:
        "Sandbox agent run did not produce a failing-test repro payload.",
      confidenceLevel: null,
      failingTestPaths: null,
      feedbackRequest: null,
    };
  }

  if (request.stepName === FAILING_TEST_FIX_STEP_NAME) {
    return {
      fixOperationOutcome: "agent_error",
      summaryOfFix: "Sandbox agent run did not produce a failing-test fix payload.",
      fixConfidenceLevel: null,
      fixedTestPath: null,
    };
  }

  throw new Error(`Unsupported sandbox step "${request.stepName}"`);
}

async function resolveExecutionOutcome(
  request: SandboxAgentRunRequest,
  payloadAbsolutePath: string,
): Promise<AgentExecutionOutcome> {
  const payload = await tryReadPayload(payloadAbsolutePath);
  if (payload) {
    return {
      status: "complete",
      payload,
    };
  }

  return {
    status: "error",
    payload: buildFallbackPayload(
      request,
      "Sandbox AI generation did not produce the expected payload file.",
    ),
  };
}

async function submitCallback(
  request: SandboxAgentRunRequest,
  outcome: AgentExecutionOutcome,
): Promise<void> {
  const callbackUrl = new URL(request.callback.url);
  callbackUrl.searchParams.set(
    "stepExecutionId",
    request.callback.query.stepExecutionId,
  );
  callbackUrl.searchParams.set("agentStatus", outcome.status);
  callbackUrl.searchParams.set("agentBranch", buildAgentBranch(request));

  const response = await fetch(callbackUrl, {
    method: request.callback.method,
    headers: request.callback.headers,
    body: JSON.stringify(outcome.payload),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Callback failed with ${response.status}: ${responseText || "no response body"}`,
    );
  }
}

async function main(): Promise<void> {
  const request = parseRequestFromEnv();
  const workspacePath = await ensureWorkspace(request);
  const payloadAbsolutePath = resolve(
    workspacePath,
    getPayloadRelativePath(request.stepName),
  );

  try {
    const payload = await generateSandboxAgentPayload({
      workspacePath,
      stepName: request.stepName,
      customInstructions: request.customInstructions,
    });
    await writeFile(payloadAbsolutePath, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    const failureReason =
      error instanceof Error ? error.message : "Unknown sandbox AI error";
    await writeFile(
      payloadAbsolutePath,
      JSON.stringify(buildFallbackPayload(request, failureReason), null, 2),
      "utf8",
    );
  }

  const outcome = await resolveExecutionOutcome(request, payloadAbsolutePath);
  await submitCallback(request, outcome);
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  void main().catch((error) => {
    console.error("[sandbox-runner] run failed:", error);
    process.exitCode = 1;
  });
}

export const sandboxTaskRunnerInternals = {
  getPayloadRelativePath,
  buildFallbackPayload,
};
