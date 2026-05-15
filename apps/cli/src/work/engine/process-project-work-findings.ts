import Ajv from "ajv";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { AnyJsonValue } from "../../lib/json";
import type { startProcessClaimedExecution } from "./process-claimed-step-execution";
import type { ProcessProjectWorkDeps } from "./process-project-work.types";

const STEP_FINDINGS_SUBMISSION_RELATIVE_PATH =
  ".boboddy/step-findings-submission.json";

export function buildFindingsSubmissionPath(workspacePath: string): string {
  return path.join(workspacePath, STEP_FINDINGS_SUBMISSION_RELATIVE_PATH);
}

async function tryReadFindingsSubmission(
  workspacePath: string,
): Promise<Record<string, unknown> | null> {
  const submissionPath = buildFindingsSubmissionPath(workspacePath);

  try {
    await access(submissionPath);
  } catch {
    return null;
  }

  const rawPayload = await readFile(submissionPath, "utf8");
  const parsed: unknown = JSON.parse(rawPayload);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function validateFindingsAgainstSchema(
  findings: AnyJsonValue,
  resultSchemaJson: Record<string, unknown> | null,
): { ok: true } | { ok: false; reason: string } {
  if (!resultSchemaJson) {
    return {
      ok: false,
      reason:
        "Step definition resultSchemaJson is missing; cannot complete agent submission.",
    };
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  let validate: ReturnType<Ajv["compile"]>;
  try {
    validate = ajv.compile(resultSchemaJson);
  } catch (error) {
    return {
      ok: false,
      reason: `Step definition resultSchemaJson is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const valid = validate(findings);
  if (valid) {
    return { ok: true };
  }

  const details = (validate.errors ?? [])
    .map(
      (issue) => `${issue.instancePath || "/"} ${issue.message ?? "invalid"}`,
    )
    .join("; ");

  return {
    ok: false,
    reason: `findingsJson does not match resultSchemaJson: ${details || "validation failed"}`,
  };
}

export async function tryPersistAgentFindings(
  deps: ProcessProjectWorkDeps,
  startedExecution: Awaited<ReturnType<typeof startProcessClaimedExecution>>,
): Promise<"submitted" | "missing"> {
  const parsedPayload = await tryReadFindingsSubmission(
    startedExecution.environment.workspacePath,
  );

  if (!parsedPayload) {
    return "missing";
  }

  const findingsJson = parsedPayload["findingsJson"] as AnyJsonValue;
  const validation = validateFindingsAgainstSchema(
    findingsJson,
    startedExecution.resultSchemaJson,
  );

  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  await deps.workerClient.completeStepExecution({
    stepExecutionId: startedExecution.stepExecutionId,
    claimToken: startedExecution.claimToken,
    resultJson: findingsJson,
    errorJson: null,
  });

  await rm(
    buildFindingsSubmissionPath(startedExecution.environment.workspacePath),
    {
      force: true,
    },
  );
  return "submitted";
}
