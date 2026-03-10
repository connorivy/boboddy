import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pipelineRuns, ticketStepExecutionsTph } from "@/lib/db/schema";
import type { InProcessDomainEventBus } from "@/lib/domain-events/in-process-domain-event-bus";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_INVESTIGATION_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import type { PipelineStepExecutionsQuery } from "@/modules/step-executions/contracts/get-pipeline-step-executions-contracts";
import {
  type FailingTestReproFeedbackRequestEntity,
  FailingTestReproAgentErrorResultEntity,
  FailingTestReproCancelledResultEntity,
  FailingTestReproNeedsUserFeedbackResultEntity,
  FailingTestReproNotReproducibleResultEntity,
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionEnrichmentStepResultEntity,
  TicketDescriptionQualityStepExecutionEntity,
  FailingTestFixStepCompletionResultEntity,
  FailingTestFixStepExecutionEntity,
  FailingTestFixStepResultEntity,
  FailingTestReproStepExecutionEntity,
  FailingTestReproStepResultEntity,
  FailingTestReproSucceededResultEntity,
  TicketDuplicateCandidateResultItemEntity,
  TicketDuplicateCandidatesResultEntity,
  TicketDescriptionQualityStepResultEntity,
  TicketDuplicateCandidatesStepResultEntity,
  TicketPipelineStepExecutionEntity,
} from "../domain/step-execution-entity";
import { DbExecutor } from "@/lib/db/db-executor";
import { StepExecutionRepo } from "../application/step-execution-repo";
import { ticketDescriptionEnrichmentEvidenceFieldsSchema } from "@/modules/step-executions/ticket_description_enrichment/shared/ticket-description-enrichment-result";

function requiredField<T>(
  value: T | null | undefined,
  fieldName: string,
  context: string,
): T {
  if (value === null || value === undefined) {
    throw new Error(`Missing required field '${fieldName}' for ${context}`);
  }

  return value;
}

function requiredTruthyField<T>(
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

function requiredNonEmptyString(
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

function parseIsoDateOrThrow(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO date in '${fieldName}': ${value}`);
  }

  return parsed;
}

function parseFixOperationOutcome(
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

function parseFailingTestPaths(
  value: string | null | undefined,
): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const paths = value
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);

  if (paths.length === 0) {
    return undefined;
  }

  return paths;
}

function serializeFailingTestPaths(paths: string[] | undefined): string | null {
  if (!paths || paths.length === 0) {
    return null;
  }

  return paths
    .map((path) => path.trim())
    .filter(Boolean)
    .join(",");
}

function parseFeedbackRequest(
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

  return {
    requestId,
    reason,
    questions,
    assumptions,
  };
}

function mapFailingTestReproResultOrNull(
  row: typeof ticketStepExecutionsTph.$inferSelect,
): FailingTestReproStepResultEntity | null {
  const context = `${FAILING_TEST_REPRO_STEP_NAME} (execution ${row.id})`;
  const hasResult = Boolean(row.agentBranch);
  if (!hasResult) {
    return null;
  }

  const rawResultJson =
    row.rawResultJson && typeof row.rawResultJson === "object"
      ? (row.rawResultJson as Record<string, unknown>)
      : undefined;

  const githubMergeStatus = requiredTruthyField(
    row.githubMergeStatus,
    "githubMergeStatus",
    context,
  );
  const githubIssueNumber = requiredTruthyField(
    row.githubIssueNumber,
    "githubIssueNumber",
    context,
  );
  const githubIssueId = requiredNonEmptyString(
    row.githubIssueId,
    "githubIssueId",
    context,
  );
  const agentStatus = requiredTruthyField(row.agentStatus, "agentStatus", context);
  const agentBranch = requiredNonEmptyString(
    row.agentBranch,
    "agentBranch",
    context,
  );
  const summaryOfFindings = requiredNonEmptyString(
    row.summaryOfFindings,
    "summaryOfFindings",
    context,
  );
  const githubAgentRunId = row.githubAgentRunId ?? undefined;
  const failingTestCommitSha = row.failingTestCommitSha ?? undefined;

  switch (requiredTruthyField(row.outcome, "outcome", context)) {
    case "reproduced":
      return new FailingTestReproSucceededResultEntity(
        githubMergeStatus,
        githubIssueNumber,
        githubIssueId,
        agentStatus,
        agentBranch,
        summaryOfFindings,
        requiredTruthyField(row.confidenceLevel, "confidenceLevel", context),
        parseFailingTestPaths(row.failingTestPath) ?? [],
        githubAgentRunId,
        failingTestCommitSha,
        rawResultJson,
      );
    case "not_reproducible":
      return new FailingTestReproNotReproducibleResultEntity(
        githubMergeStatus,
        githubIssueNumber,
        githubIssueId,
        agentStatus,
        agentBranch,
        summaryOfFindings,
        requiredTruthyField(row.confidenceLevel, "confidenceLevel", context),
        githubAgentRunId,
        failingTestCommitSha,
        rawResultJson,
      );
    case "needs_user_feedback": {
      const feedbackRequest = parseFeedbackRequest(rawResultJson);
      if (!feedbackRequest) {
        throw new Error(`Missing feedbackRequest for ${context}`);
      }
      return new FailingTestReproNeedsUserFeedbackResultEntity(
        githubMergeStatus,
        githubIssueNumber,
        githubIssueId,
        agentStatus,
        agentBranch,
        summaryOfFindings,
        feedbackRequest,
        githubAgentRunId,
        failingTestCommitSha,
        rawResultJson,
      );
    }
    case "agent_error":
      return new FailingTestReproAgentErrorResultEntity(
        githubMergeStatus,
        githubIssueNumber,
        githubIssueId,
        agentStatus,
        agentBranch,
        summaryOfFindings,
        requiredNonEmptyString(row.failureReason, "failureReason", context),
        githubAgentRunId,
        failingTestCommitSha,
        rawResultJson,
      );
    case "cancelled":
      return new FailingTestReproCancelledResultEntity(
        githubMergeStatus,
        githubIssueNumber,
        githubIssueId,
        agentStatus,
        agentBranch,
        summaryOfFindings,
        row.failureReason ?? undefined,
        githubAgentRunId,
        failingTestCommitSha,
        rawResultJson,
      );
  }
}

function mapFailingTestFixResultOrNull(
  row: typeof ticketStepExecutionsTph.$inferSelect,
): FailingTestFixStepResultEntity | null {
  const context = `${FAILING_TEST_FIX_STEP_NAME} (execution ${row.id})`;
  const hasResult = Boolean(row.githubPrTargetBranch);
  if (!hasResult) {
    return null;
  }

  const hasCompletionResult = Boolean(row.summaryOfFix);
  let completionResult: FailingTestFixStepCompletionResultEntity | null = null;
  if (hasCompletionResult) {
    completionResult = new FailingTestFixStepCompletionResultEntity(
      requiredTruthyField(row.agentStatus, "agentStatus", context),
      requiredNonEmptyString(row.agentBranch, "agentBranch", context),
      requiredField(
        parseFixOperationOutcome(row.fixOperationOutcome),
        "fixOperationOutcome",
        context,
      ),
      requiredNonEmptyString(row.summaryOfFix, "summaryOfFix", context),
      requiredTruthyField(
        row.fixConfidenceLevel,
        "fixConfidenceLevel",
        context,
      ),
      row.fixedTestPath ?? row.failingTestPath ?? undefined,
      row.failureReason ?? undefined,
      row.rawResultJson && typeof row.rawResultJson === "object"
        ? (row.rawResultJson as Record<string, unknown>)
        : undefined,
    );
  }

  return new FailingTestFixStepResultEntity(
    requiredTruthyField(row.githubMergeStatus, "githubMergeStatus", context),
    requiredTruthyField(row.githubIssueNumber, "githubIssueNumber", context),
    requiredNonEmptyString(row.githubIssueId, "githubIssueId", context),
    requiredNonEmptyString(
      row.githubPrTargetBranch,
      "githubPrTargetBranch",
      context,
    ),
    completionResult,
    row.githubAgentRunId ?? undefined,
    row.agentSummary ?? undefined,
    row.failingTestPath ?? undefined,
    row.failingTestCommitSha ?? undefined,
  );
}

function mapDescriptionQualityResultOrNull(
  row: typeof ticketStepExecutionsTph.$inferSelect,
): TicketDescriptionQualityStepResultEntity | null {
  const context = `${TICKET_DESCRIPTION_QUALITY_STEP_NAME} (execution ${row.id})`;
  const hasResult = row.stepsToReproduceScore !== null;
  if (!hasResult) {
    return null;
  }

  return new TicketDescriptionQualityStepResultEntity(
    requiredField(row.stepsToReproduceScore, "stepsToReproduceScore", context),
    requiredField(row.expectedBehaviorScore, "expectedBehaviorScore", context),
    requiredField(row.observedBehaviorScore, "observedBehaviorScore", context),
    requiredNonEmptyString(row.reasoning, "reasoning", context),
    requiredNonEmptyString(row.rawResponse, "rawResponse", context),
  );
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function mapDescriptionEnrichmentResultOrNull(
  row: typeof ticketStepExecutionsTph.$inferSelect,
): TicketDescriptionEnrichmentStepResultEntity | null {
  const context = `${TICKET_INVESTIGATION_STEP_NAME} (execution ${row.id})`;
  const hasResult = Boolean(row.summaryOfFindings && row.rawResultJson);
  if (!hasResult) {
    return null;
  }

  const rawResultJson =
    row.rawResultJson && typeof row.rawResultJson === "object"
      ? (row.rawResultJson as Record<string, unknown>)
      : undefined;
  if (!rawResultJson) {
    return null;
  }

  const investigationReport = requiredNonEmptyString(
    typeof rawResultJson.investigationReport === "string"
      ? rawResultJson.investigationReport
      : typeof rawResultJson.enrichedTicketDescription === "string"
        ? rawResultJson.enrichedTicketDescription
        : null,
    "investigationReport",
    context,
  );

  const datadogTimeRange =
    typeof rawResultJson.datadogTimeRange === "string"
      ? rawResultJson.datadogTimeRange
      : null;
  const evidenceFields =
    ticketDescriptionEnrichmentEvidenceFieldsSchema.parse(rawResultJson);
  const operationOutcome =
    rawResultJson.operationOutcome === "findings_recorded" ||
    rawResultJson.operationOutcome === "inconclusive" ||
    rawResultJson.operationOutcome === "agent_error" ||
    rawResultJson.operationOutcome === "cancelled"
      ? rawResultJson.operationOutcome
      : "agent_error";
  const agentStatus =
    row.agentStatus === "complete" ||
    row.agentStatus === "error" ||
    row.agentStatus === "abort" ||
    row.agentStatus === "timeout" ||
    row.agentStatus === "user_exit"
      ? row.agentStatus
      : "error";

  return new TicketDescriptionEnrichmentStepResultEntity(
    requiredNonEmptyString(row.summaryOfFindings, "summaryOfFindings", context),
    investigationReport,
    evidenceFields.whatHappened,
    evidenceFields.datadogQueryTerms,
    datadogTimeRange,
    evidenceFields.keyIdentifiers,
    evidenceFields.exactEventTimes,
    evidenceFields.codeUnitsInvolved,
    evidenceFields.databaseFindings,
    evidenceFields.logFindings,
    evidenceFields.datadogSessionFindings,
    evidenceFields.investigationGaps,
    evidenceFields.recommendedNextQueries,
    row.confidenceLevel ?? null,
    rawResultJson,
    agentStatus,
    requiredNonEmptyString(row.agentBranch, "agentBranch", context),
    operationOutcome,
  );
}

function parseDuplicateCandidatesList(
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

function mapDuplicateCandidatesResultOrNull(
  row: typeof ticketStepExecutionsTph.$inferSelect,
): TicketDuplicateCandidatesResultEntity | null {
  const hasResult =
    row.duplicateCandidatesProposed !== null ||
    row.duplicateCandidatesDismissed !== null ||
    row.duplicateCandidatesPromoted !== null;
  if (!hasResult) {
    return null;
  }

  const context = `${TICKET_DUPLICATE_CANDIDATES_STEP_NAME} (execution ${row.id})`;
  return new TicketDuplicateCandidatesResultEntity(
    parseDuplicateCandidatesList(
      row.duplicateCandidatesProposed,
      "duplicateCandidatesProposed",
      context,
    ),
    parseDuplicateCandidatesList(
      row.duplicateCandidatesDismissed,
      "duplicateCandidatesDismissed",
      context,
    ),
    parseDuplicateCandidatesList(
      row.duplicateCandidatesPromoted,
      "duplicateCandidatesPromoted",
      context,
    ),
  );
}

export class DrizzleStepExecutionRepo implements StepExecutionRepo {
  constructor(
    private readonly domainEventBus: InProcessDomainEventBus | null = null,
  ) {}

  private mapRowToExecution(
    row: typeof ticketStepExecutionsTph.$inferSelect,
    ticketId: string = row.ticketId,
  ): TicketPipelineStepExecutionEntity {
    if (row.type !== row.stepName) {
      throw new Error(
        `Corrupt step execution row ${row.id}: stepName '${row.stepName}' does not match type '${row.type}'`,
      );
    }

    if (row.type === TICKET_DESCRIPTION_QUALITY_STEP_NAME) {
      return new TicketDescriptionQualityStepExecutionEntity(
        row.pipelineId,
        ticketId,
        row.status,
        mapDescriptionQualityResultOrNull(row),
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
        row.failureReason ?? undefined,
      );
    }

    if (row.type === TICKET_INVESTIGATION_STEP_NAME) {
      return new TicketDescriptionEnrichmentStepExecutionEntity(
        row.pipelineId,
        ticketId,
        row.status,
        mapDescriptionEnrichmentResultOrNull(row),
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
        row.failureReason ?? undefined,
      );
    }

    if (row.type === FAILING_TEST_REPRO_STEP_NAME) {
      return new FailingTestReproStepExecutionEntity(
        row.pipelineId,
        ticketId,
        row.status,
        mapFailingTestReproResultOrNull(row),
        row.githubPrTargetBranch ?? null,
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
        row.failureReason ?? undefined,
      );
    }

    if (row.type === FAILING_TEST_FIX_STEP_NAME) {
      return new FailingTestFixStepExecutionEntity(
        row.pipelineId,
        ticketId,
        row.status,
        mapFailingTestFixResultOrNull(row),
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
        row.failureReason ?? undefined,
      );
    }

    if (row.type === TICKET_DUPLICATE_CANDIDATES_STEP_NAME) {
      return new TicketDuplicateCandidatesStepResultEntity(
        row.pipelineId,
        ticketId,
        row.status,
        mapDuplicateCandidatesResultOrNull(row),
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
        row.failureReason ?? undefined,
      );
    }

    throw new Error(
      `Corrupt step execution row ${row.id}: unknown step type '${row.type}'`,
    );
  }

  async load(id: string): Promise<TicketPipelineStepExecutionEntity | null> {
    const db = getDb();

    const [row] = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(eq(ticketStepExecutionsTph.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return this.mapRowToExecution(row);
  }

  async loadQueued(
    limit: number,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    const db = getDb();
    const safeLimit = Math.max(1, Math.min(limit, 100));

    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(eq(ticketStepExecutionsTph.status, "queued"))
      .orderBy(
        asc(ticketStepExecutionsTph.startedAt),
        asc(ticketStepExecutionsTph.id),
      )
      .limit(safeLimit);

    return rows.map((row) => this.mapRowToExecution(row));
  }

  async claimQueued(
    id: string,
  ): Promise<TicketPipelineStepExecutionEntity | null> {
    const db = getDb();
    const now = new Date();

    const [row] = await db
      .update(ticketStepExecutionsTph)
      .set({
        status: "running",
        updatedAt: now,
        endedAt: null,
      })
      .where(
        and(
          eq(ticketStepExecutionsTph.id, id),
          eq(ticketStepExecutionsTph.status, "queued"),
        ),
      )
      .returning();

    if (!row) {
      return null;
    }

    return this.mapRowToExecution(row);
  }

  async loadByPipelineId(
    pipelineId: string,
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    const db = dbExecutor ?? getDb();

    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(eq(ticketStepExecutionsTph.pipelineId, pipelineId))
      .orderBy(
        desc(ticketStepExecutionsTph.startedAt),
        desc(ticketStepExecutionsTph.id),
      );

    return rows.map((row) => this.mapRowToExecution(row));
  }

  async loadByPipelineIds(
    pipelineIds: string[],
  ): Promise<Map<string, TicketPipelineStepExecutionEntity[]>> {
    if (pipelineIds.length === 0) {
      return new Map();
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(inArray(ticketStepExecutionsTph.pipelineId, pipelineIds))
      .orderBy(
        desc(ticketStepExecutionsTph.startedAt),
        desc(ticketStepExecutionsTph.id),
      );

    const stepExecutionsByPipelineId = new Map<
      string,
      TicketPipelineStepExecutionEntity[]
    >();

    for (const row of rows) {
      if (!row.pipelineId) {
        continue;
      }

      const execution = this.mapRowToExecution(row);
      const executions = stepExecutionsByPipelineId.get(row.pipelineId);
      if (executions) {
        executions.push(execution);
      } else {
        stepExecutionsByPipelineId.set(row.pipelineId, [execution]);
      }
    }

    return stepExecutionsByPipelineId;
  }

  async loadByTicketId(
    ticketId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    return this.getByTicketId(ticketId);
  }

  async getByTicketId(
    ticketId: string,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    const db = getDb();

    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(eq(ticketStepExecutionsTph.ticketId, ticketId))
      .orderBy(
        desc(ticketStepExecutionsTph.startedAt),
        desc(ticketStepExecutionsTph.id),
      );

    return rows.map((row) => this.mapRowToExecution(row, ticketId));
  }

  async loadPage(
    query: PipelineStepExecutionsQuery,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    const db = getDb();

    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .orderBy(
        desc(ticketStepExecutionsTph.startedAt),
        desc(ticketStepExecutionsTph.id),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return rows.map((row) => this.mapRowToExecution(row));
  }

  async count(): Promise<number> {
    const db = getDb();

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ticketStepExecutionsTph);

    return Number(result?.count ?? 0);
  }

  private buildDiscriminatorResetFields() {
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
      fixedTestPath: null,
      failingTestCommitSha: null,
      summaryOfFindings: null,
      summaryOfFix: null,
      confidenceLevel: null,
      fixConfidenceLevel: null,
      fixOperationOutcome: null,
      rawResultJson: null,
      completedAt: null,
      lastPolledAt: null,
      duplicateCandidatesProposed: null,
      duplicateCandidatesDismissed: null,
      duplicateCandidatesPromoted: null,
    };
  }

  private async saveStepExecution(
    tx: DbExecutor,
    pipeline: TicketPipelineStepExecutionEntity,
    startedAt: Date,
    endedAt: Date | null,
    now: Date,
    fields: Record<string, unknown>,
  ): Promise<TicketPipelineStepExecutionEntity> {
    const [updated] = await tx
      .update(ticketStepExecutionsTph)
      .set({
        pipelineId: pipeline.pipelineId,
        ticketId: pipeline.ticketId,
        stepName: pipeline.stepName,
        type: pipeline.stepName,
        status: pipeline.status,
        startedAt,
        endedAt,
        updatedAt: now,
        failureReason: pipeline.failureReason,
        ...fields,
      })
      .where(eq(ticketStepExecutionsTph.id, pipeline.id))
      .returning({
        id: ticketStepExecutionsTph.id,
        createdAt: ticketStepExecutionsTph.createdAt,
        updatedAt: ticketStepExecutionsTph.updatedAt,
      });

    if (updated) {
      pipeline.id = updated.id;
      pipeline.createdAt = updated.createdAt.toISOString();
      pipeline.updatedAt = updated.updatedAt.toISOString();
      return pipeline;
    }

    const [inserted] = await tx
      .insert(ticketStepExecutionsTph)
      .values({
        id: pipeline.id,
        pipelineId: pipeline.pipelineId,
        ticketId: pipeline.ticketId,
        stepName: pipeline.stepName,
        type: pipeline.stepName,
        status: pipeline.status,
        // This column remains in the DB schema; use execution id as a stable unique value.
        idempotencyKey: pipeline.id,
        startedAt,
        endedAt,
        createdAt: pipeline.createdAt
          ? parseIsoDateOrThrow(pipeline.createdAt, "createdAt")
          : now,
        updatedAt: now,
        failureReason: pipeline.failureReason,
        ...fields,
      })
      .returning({
        id: ticketStepExecutionsTph.id,
        createdAt: ticketStepExecutionsTph.createdAt,
        updatedAt: ticketStepExecutionsTph.updatedAt,
      });

    pipeline.id = inserted.id;
    pipeline.createdAt = inserted.createdAt.toISOString();
    pipeline.updatedAt = inserted.updatedAt.toISOString();
    return pipeline;
  }

  private saveDescriptionEnrichmentExecution(
    tx: DbExecutor,
    pipeline: TicketDescriptionEnrichmentStepExecutionEntity,
    startedAt: Date,
    endedAt: Date | null,
    now: Date,
  ): Promise<TicketPipelineStepExecutionEntity> {
    let fields: Record<string, unknown> = this.buildDiscriminatorResetFields();

    if (pipeline.status === "succeeded") {
      if (!pipeline.result) {
        throw new Error(
          "Missing required description enrichment result payload for succeeded execution",
        );
      }

      fields = {
        ...fields,
        agentStatus: pipeline.result.agentStatus,
        agentBranch: pipeline.result.agentBranch,
        summaryOfFindings: pipeline.result.summaryOfInvestigation,
        confidenceLevel: pipeline.result.confidenceLevel,
        rawResultJson: {
          ...pipeline.result.rawResultJson,
          summaryOfInvestigation: pipeline.result.summaryOfInvestigation,
          whatHappened: pipeline.result.whatHappened,
          datadogQueryTerms: pipeline.result.datadogQueryTerms,
          datadogTimeRange: pipeline.result.datadogTimeRange,
          keyIdentifiers: pipeline.result.keyIdentifiers,
          exactEventTimes: pipeline.result.exactEventTimes,
          codeUnitsInvolved: pipeline.result.codeUnitsInvolved,
          databaseFindings: pipeline.result.databaseFindings,
          logFindings: pipeline.result.logFindings,
          datadogSessionFindings: pipeline.result.datadogSessionFindings,
          investigationGaps: pipeline.result.investigationGaps,
          recommendedNextQueries: pipeline.result.recommendedNextQueries,
          investigationReport: pipeline.result.investigationReport,
          operationOutcome: pipeline.result.operationOutcome,
        },
        completedAt: endedAt,
        lastPolledAt: now,
      };
    }

    return this.saveStepExecution(
      tx,
      pipeline,
      startedAt,
      endedAt,
      now,
      fields,
    );
  }

  private saveDescriptionQualityExecution(
    tx: DbExecutor,
    pipeline: TicketDescriptionQualityStepExecutionEntity,
    startedAt: Date,
    endedAt: Date | null,
    now: Date,
  ): Promise<TicketPipelineStepExecutionEntity> {
    let fields: Record<string, unknown> = this.buildDiscriminatorResetFields();

    if (pipeline.status === "succeeded") {
      if (!pipeline.result) {
        throw new Error(
          "Missing required description quality result payload for succeeded execution",
        );
      }

      fields = {
        ...fields,
        stepsToReproduceScore: requiredField(
          pipeline.result.stepsToReproduceScore,
          "stepsToReproduceScore",
          pipeline.stepName,
        ),
        expectedBehaviorScore: requiredField(
          pipeline.result.expectedBehaviorScore,
          "expectedBehaviorScore",
          pipeline.stepName,
        ),
        observedBehaviorScore: requiredField(
          pipeline.result.observedBehaviorScore,
          "observedBehaviorScore",
          pipeline.stepName,
        ),
        reasoning: requiredField(
          pipeline.result.reasoning,
          "reasoning",
          pipeline.stepName,
        ),
        rawResponse: requiredField(
          pipeline.result.rawResponse,
          "rawResponse",
          pipeline.stepName,
        ),
      };
    }

    return this.saveStepExecution(
      tx,
      pipeline,
      startedAt,
      endedAt,
      now,
      fields,
    );
  }

  private saveDuplicateCandidatesExecution(
    tx: DbExecutor,
    pipeline: TicketDuplicateCandidatesStepResultEntity,
    startedAt: Date,
    endedAt: Date | null,
    now: Date,
  ): Promise<TicketPipelineStepExecutionEntity> {
    let fields: Record<string, unknown> = this.buildDiscriminatorResetFields();

    if (pipeline.status === "succeeded") {
      if (!pipeline.result) {
        throw new Error(
          "Missing required duplicate candidates result payload for succeeded execution",
        );
      }

      fields = {
        ...fields,
        duplicateCandidatesProposed: JSON.stringify(pipeline.result.proposed),
        duplicateCandidatesDismissed: JSON.stringify(pipeline.result.dismissed),
        duplicateCandidatesPromoted: JSON.stringify(pipeline.result.promoted),
      };
    }

    return this.saveStepExecution(
      tx,
      pipeline,
      startedAt,
      endedAt,
      now,
      fields,
    );
  }

  private saveFailingTestReproExecution(
    tx: DbExecutor,
    pipeline: FailingTestReproStepExecutionEntity,
    startedAt: Date,
    endedAt: Date | null,
    now: Date,
  ): Promise<TicketPipelineStepExecutionEntity> {
    const reproResult = pipeline.result;
    const confidenceLevel =
      reproResult?.outcome === "reproduced" ||
      reproResult?.outcome === "not_reproducible"
        ? reproResult.confidenceLevel
        : null;
    const failingTestPaths =
      reproResult?.outcome === "reproduced"
        ? reproResult.failingTestPaths
        : undefined;
    const failureReason =
      reproResult?.outcome === "agent_error" ||
      reproResult?.outcome === "cancelled"
        ? reproResult.failureReason
        : null;
    const fields = {
      ...this.buildDiscriminatorResetFields(),
      githubIssueNumber: reproResult?.githubIssueNumber ?? null,
      githubIssueId: reproResult?.githubIssueId ?? null,
      githubAgentRunId: reproResult?.githubAgentRunId ?? null,
      agentStatus: reproResult?.agentStatus ?? null,
      githubMergeStatus: reproResult?.githubMergeStatus ?? "draft",
      githubPrTargetBranch: pipeline.githubPrTargetBranch,
      agentBranch: reproResult?.agentBranch ?? null,
      failingTestCommitSha: reproResult?.failingTestCommitSha ?? null,
      failureReason,
      rawResultJson: reproResult?.rawResultJson ?? null,
      completedAt: endedAt,
      lastPolledAt: now,
      outcome: reproResult?.outcome ?? null,
      failingTestPath: serializeFailingTestPaths(failingTestPaths),
      summaryOfFindings: reproResult?.summaryOfFindings ?? null,
      confidenceLevel,
    };

    return this.saveStepExecution(
      tx,
      pipeline,
      startedAt,
      endedAt,
      now,
      fields,
    );
  }

  private saveFailingTestFixExecution(
    tx: DbExecutor,
    pipeline: FailingTestFixStepExecutionEntity,
    startedAt: Date,
    endedAt: Date | null,
    now: Date,
  ): Promise<TicketPipelineStepExecutionEntity> {
    const fixResult = pipeline.result;
    const completionResult = fixResult?.completionResult;
    const fields = {
      ...this.buildDiscriminatorResetFields(),
      githubIssueNumber: fixResult?.githubIssueNumber ?? null,
      githubIssueId: fixResult?.githubIssueId ?? null,
      githubAgentRunId: fixResult?.githubAgentRunId ?? null,
      agentStatus: completionResult?.agentStatus ?? null,
      githubMergeStatus: fixResult?.githubMergeStatus ?? "draft",
      githubPrTargetBranch: fixResult?.githubPrTargetBranch ?? null,
      agentBranch: completionResult?.agentBranch ?? null,
      agentSummary: fixResult?.agentSummary ?? null,
      failingTestCommitSha: fixResult?.failingTestCommitSha ?? null,
      failureReason: completionResult?.failureReason ?? null,
      rawResultJson: completionResult?.rawResultJson ?? null,
      completedAt: endedAt,
      lastPolledAt: now,
      fixOperationOutcome: completionResult?.fixOperationOutcome ?? null,
      fixedTestPath:
        completionResult?.fixedTestPath ?? fixResult?.failingTestPath ?? null,
      summaryOfFix: completionResult?.summaryOfFix ?? null,
      fixConfidenceLevel: completionResult?.fixConfidenceLevel ?? null,
    };

    return this.saveStepExecution(
      tx,
      pipeline,
      startedAt,
      endedAt,
      now,
      fields,
    );
  }

  async save(
    pipeline: TicketPipelineStepExecutionEntity,
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity> {
    if (dbExecutor) {
      return this.saveInExecutor(pipeline, dbExecutor);
    }

    return getDb().transaction(async (tx) => this.saveInExecutor(pipeline, tx));
  }

  async saveMany(
    stepExecutions: TicketPipelineStepExecutionEntity[],
    dbExecutor?: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity[]> {
    if (stepExecutions.length === 0) {
      return [];
    }

    if (dbExecutor) {
      const savedExecutions: TicketPipelineStepExecutionEntity[] = [];
      for (const stepExecution of stepExecutions) {
        savedExecutions.push(await this.saveInExecutor(stepExecution, dbExecutor));
      }

      return savedExecutions;
    }

    return getDb().transaction(async (tx) => {
      const savedExecutions: TicketPipelineStepExecutionEntity[] = [];
      for (const stepExecution of stepExecutions) {
        savedExecutions.push(await this.saveInExecutor(stepExecution, tx));
      }

      return savedExecutions;
    });
  }

  private async saveInExecutor(
    pipeline: TicketPipelineStepExecutionEntity,
    dbExecutor: DbExecutor,
  ): Promise<TicketPipelineStepExecutionEntity> {
    const now = new Date();
    const startedAt = parseIsoDateOrThrow(pipeline.startedAt, "startedAt");
    const endedAt = pipeline.endedAt
      ? parseIsoDateOrThrow(pipeline.endedAt, "endedAt")
      : null;

    let savedExecution: TicketPipelineStepExecutionEntity;
    if (pipeline instanceof TicketDescriptionEnrichmentStepExecutionEntity) {
      savedExecution = await this.saveDescriptionEnrichmentExecution(
        dbExecutor,
        pipeline,
        startedAt,
        endedAt,
        now,
      );
    } else if (
      pipeline instanceof TicketDescriptionQualityStepExecutionEntity
    ) {
      savedExecution = await this.saveDescriptionQualityExecution(
        dbExecutor,
        pipeline,
        startedAt,
        endedAt,
        now,
      );
    } else if (pipeline instanceof TicketDuplicateCandidatesStepResultEntity) {
      savedExecution = await this.saveDuplicateCandidatesExecution(
        dbExecutor,
        pipeline,
        startedAt,
        endedAt,
        now,
      );
    } else if (pipeline instanceof FailingTestReproStepExecutionEntity) {
      savedExecution = await this.saveFailingTestReproExecution(
        dbExecutor,
        pipeline,
        startedAt,
        endedAt,
        now,
      );
    } else if (pipeline instanceof FailingTestFixStepExecutionEntity) {
      savedExecution = await this.saveFailingTestFixExecution(
        dbExecutor,
        pipeline,
        startedAt,
        endedAt,
        now,
      );
    } else {
      throw new Error(
        `Unsupported pipeline step execution type: ${pipeline.constructor.name}`,
      );
    }

    const domainEvents = pipeline.pullDomainEvents();
    if (this.domainEventBus && domainEvents.length > 0) {
      await this.domainEventBus.publish(
        domainEvents,
        dbExecutor as Parameters<InProcessDomainEventBus["publish"]>[1],
      );
    }

    return savedExecution;
  }
}
