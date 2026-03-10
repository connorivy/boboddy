import { ticketStepExecutionsTph } from "@/lib/db/schema";
import type { PipelineRunEntity } from "@/modules/pipeline-runs/domain/pipeline-run-aggregate";
import {
  type FailingTestReproFeedbackRequestEntity,
  FailingTestFixStepCompletionResultEntity,
  TicketDuplicateCandidateResultItemEntity,
  TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import type { StepExecutionContract } from "@/modules/step-executions/contracts/step-execution-contracts";
import type { StepExecutionStepName } from "@/modules/step-executions/domain/step-execution.types";

export type StepExecutionRow = typeof ticketStepExecutionsTph.$inferSelect;
export type StepExecutionPersistenceFields = Record<string, unknown>;

export type StepExecutionDefinition<
  TExecution extends TicketPipelineStepExecutionEntity = TicketPipelineStepExecutionEntity,
> = {
  stepName: StepExecutionStepName;
  isExecution(
    execution: TicketPipelineStepExecutionEntity,
  ): execution is TExecution;
  createQueuedExecution(args: {
    pipelineId: string;
    ticketId: string;
    now?: Date;
  }): TExecution;
  deserializeExecution(row: StepExecutionRow, ticketId?: string): TExecution;
  serializeExecution(args: {
    execution: TExecution;
    endedAt: Date | null;
    now: Date;
  }): StepExecutionPersistenceFields;
  mapResultToContract(
    execution: TExecution,
  ): StepExecutionContract["result"];
  shouldAdvance(execution: TExecution, pipelineRun: PipelineRunEntity): boolean;
};

export function requiredField<T>(
  value: T | null | undefined,
  fieldName: string,
  context: string,
): T {
  if (value === null || value === undefined) {
    throw new Error(`Missing required field '${fieldName}' for ${context}`);
  }

  return value;
}

export function requiredTruthyField<T>(
  value: T | null | undefined,
  fieldName: string,
  context: string,
): T {
  const parsed = requiredField(value, fieldName, context);
  if (!parsed) {
    throw new Error(`Missing required field '${fieldName}' for ${context}`);
  }

  return parsed;
}

export function requiredNonEmptyString(
  value: string | null | undefined,
  fieldName: string,
  context: string,
): string {
  const parsed = requiredField(value, fieldName, context);
  if (!parsed.trim()) {
    throw new Error(`Missing required field '${fieldName}' for ${context}`);
  }

  return parsed;
}

export function parseIsoDateOrThrow(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO date in '${fieldName}': ${value}`);
  }

  return parsed;
}

export function buildDiscriminatorResetFields(): StepExecutionPersistenceFields {
  return {
    stepsToReproduceScore: null,
    expectedBehaviorScore: null,
    observedBehaviorScore: null,
    reasoning: null,
    rawResponse: null,
    outcome: null,
    githubIssueNumber: null,
    githubIssueId: null,
    githubAgentRunId: null,
    agentStatus: null,
    githubMergeStatus: null,
    githubPrTargetBranch: null,
    agentBranch: null,
    agentSummary: null,
    failingTestPath: null,
    failingTestCommitSha: null,
    failureReason: null,
    summaryOfFindings: null,
    confidenceLevel: null,
    rawResultJson: null,
    completedAt: null,
    lastPolledAt: null,
    fixOperationOutcome: null,
    fixedTestPath: null,
    summaryOfFix: null,
    fixConfidenceLevel: null,
    duplicateCandidatesProposed: null,
    duplicateCandidatesDismissed: null,
    duplicateCandidatesPromoted: null,
  };
}

export function serializeFailingTestPaths(
  paths: string[] | undefined,
): string | null {
  if (!paths || paths.length === 0) {
    return null;
  }

  return paths
    .map((path) => path.trim())
    .filter(Boolean)
    .join(",");
}

export function parseFailingTestPaths(
  value: string | null | undefined,
): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const paths = value
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);

  return paths.length > 0 ? paths : undefined;
}

export function parseFixOperationOutcome(
  value: string | null,
): FailingTestFixStepCompletionResultEntity["fixOperationOutcome"] | null {
  if (value === "fixed" || value === "agent_error" || value === "cancelled") {
    return value;
  }

  if (value === "not_fixed" || value === "not_reproducible") {
    return "not_fixed";
  }

  if (value === "reproduced") {
    return "fixed";
  }

  return null;
}

export function parseFeedbackRequest(
  rawResultJson: Record<string, unknown> | undefined,
): FailingTestReproFeedbackRequestEntity | undefined {
  if (!rawResultJson) {
    return undefined;
  }

  const rawRequest = rawResultJson.feedbackRequest;
  if (!rawRequest || typeof rawRequest !== "object") {
    return undefined;
  }

  const record = rawRequest as Record<string, unknown>;
  const requestId =
    typeof record.requestId === "string" ? record.requestId.trim() : "";
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  const questions = Array.isArray(record.questions)
    ? record.questions.filter(
        (question): question is string =>
          typeof question === "string" && question.trim().length > 0,
      )
    : [];
  const assumptions = Array.isArray(record.assumptions)
    ? record.assumptions.filter(
        (assumption): assumption is string =>
          typeof assumption === "string" && assumption.trim().length > 0,
      )
    : [];

  if (!requestId || !reason || questions.length === 0) {
    return undefined;
  }

  return { requestId, reason, questions, assumptions };
}

export function parseDuplicateCandidatesList(
  value: string | null,
  fieldName: string,
  context: string,
): TicketDuplicateCandidateResultItemEntity[] {
  if (!value) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `Invalid JSON in '${fieldName}' for ${context}: ${value.substring(0, 100)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid '${fieldName}' for ${context}: expected array`);
  }

  return parsed
    .filter((item): item is { candidateTicketId: string; score: number } =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as { candidateTicketId?: unknown }).candidateTicketId ===
            "string" &&
          (item as { candidateTicketId: string }).candidateTicketId.trim()
            .length > 0 &&
          typeof (item as { score?: unknown }).score === "number" &&
          Number.isFinite((item as { score: number }).score) &&
          (item as { score: number }).score >= 0 &&
          (item as { score: number }).score <= 1,
      ),
    )
    .map(
      (item) =>
        new TicketDuplicateCandidateResultItemEntity(
          item.candidateTicketId,
          item.score,
        ),
    );
}
