import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ticketStepExecutionsTph } from "@/lib/db/schema";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import type { PipelineStepExecutionsQuery } from "@/modules/step-executions/contracts/get-pipeline-step-executions-contracts";
import {
  type FailingTestReproFeedbackRequestEntity,
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionEnrichmentStepResultEntity,
  TicketDescriptionQualityStepExecutionEntity,
  FailingTestFixStepCompletionResultEntity,
  FailingTestFixStepExecutionEntity,
  FailingTestFixStepResultEntity,
  FailingTestReproStepExecutionEntity,
  FailingTestReproStepResultEntity,
  TicketDuplicateCandidateResultItemEntity,
  TicketDuplicateCandidatesResultEntity,
  TicketDescriptionQualityStepResultEntity,
  TicketDuplicateCandidatesStepResultEntity,
  TicketPipelineStepExecutionEntity,
} from "../domain/step-execution-entity";
import { DbExecutor } from "@/lib/db/db-executor";

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
  const hasResult = Boolean(row.githubPrTargetBranch);
  if (!hasResult) {
    return null;
  }

  const rawResultJson =
    row.rawResultJson && typeof row.rawResultJson === "object"
      ? (row.rawResultJson as Record<string, unknown>)
      : undefined;

  return new FailingTestReproStepResultEntity(
    requiredTruthyField(row.githubMergeStatus, "githubMergeStatus", context),
    requiredTruthyField(row.githubIssueNumber, "githubIssueNumber", context),
    requiredNonEmptyString(row.githubIssueId, "githubIssueId", context),
    requiredTruthyField(row.agentStatus, "agentStatus", context),
    requiredNonEmptyString(
      row.githubPrTargetBranch,
      "githubPrTargetBranch",
      context,
    ),
    requiredNonEmptyString(row.agentBranch, "agentBranch", context),
    requiredTruthyField(row.outcome, "outcome", context),
    requiredNonEmptyString(row.summaryOfFindings, "summaryOfFindings", context),
    row.confidenceLevel ?? null,
    row.githubAgentRunId ?? undefined,
    parseFailingTestPaths(row.failingTestPath),
    row.failingTestCommitSha ?? undefined,
    row.failureReason ?? undefined,
    rawResultJson,
    parseFeedbackRequest(rawResultJson),
  );
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
  const hasResult = Boolean(row.stepsToReproduceScore);
  if (!hasResult) {
    return null;
  }

  return new TicketDescriptionQualityStepResultEntity(
    requiredTruthyField(
      row.stepsToReproduceScore,
      "stepsToReproduceScore",
      context,
    ),
    requiredTruthyField(
      row.expectedBehaviorScore,
      "expectedBehaviorScore",
      context,
    ),
    requiredTruthyField(
      row.observedBehaviorScore,
      "observedBehaviorScore",
      context,
    ),
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
  const context = `${TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME} (execution ${row.id})`;
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

  const enrichedTicketDescription = requiredNonEmptyString(
    typeof rawResultJson.enrichedTicketDescription === "string"
      ? rawResultJson.enrichedTicketDescription
      : null,
    "enrichedTicketDescription",
    context,
  );

  const datadogTimeRange =
    typeof rawResultJson.datadogTimeRange === "string"
      ? rawResultJson.datadogTimeRange
      : null;
  const operationOutcome =
    rawResultJson.operationOutcome === "enriched" ||
    rawResultJson.operationOutcome === "insufficient_evidence" ||
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
    enrichedTicketDescription,
    parseStringArray(rawResultJson.datadogQueryTerms),
    datadogTimeRange,
    parseStringArray(rawResultJson.keyIdentifiers),
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

export class DrizzleStepExecutionRepo {
  private mapRowToExecution(
    row: typeof ticketStepExecutionsTph.$inferSelect,
  ): TicketPipelineStepExecutionEntity {
    if (row.type !== row.stepName) {
      throw new Error(
        `Corrupt step execution row ${row.id}: stepName '${row.stepName}' does not match type '${row.type}'`,
      );
    }

    if (row.type === TICKET_DESCRIPTION_QUALITY_STEP_NAME) {
      return new TicketDescriptionQualityStepExecutionEntity(
        row.ticketId,
        row.status,
        row.idempotencyKey,
        mapDescriptionQualityResultOrNull(row),
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
      );
    }

    if (row.type === TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME) {
      return new TicketDescriptionEnrichmentStepExecutionEntity(
        row.ticketId,
        row.status,
        row.idempotencyKey,
        mapDescriptionEnrichmentResultOrNull(row),
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
      );
    }

    if (row.type === FAILING_TEST_REPRO_STEP_NAME) {
      return new FailingTestReproStepExecutionEntity(
        row.ticketId,
        row.status,
        row.idempotencyKey,
        mapFailingTestReproResultOrNull(row),
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
      );
    }

    if (row.type === FAILING_TEST_FIX_STEP_NAME) {
      return new FailingTestFixStepExecutionEntity(
        row.ticketId,
        row.status,
        row.idempotencyKey,
        mapFailingTestFixResultOrNull(row),
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
      );
    }

    if (row.type === TICKET_DUPLICATE_CANDIDATES_STEP_NAME) {
      return new TicketDuplicateCandidatesStepResultEntity(
        row.ticketId,
        row.status,
        row.idempotencyKey,
        mapDuplicateCandidatesResultOrNull(row),
        row.startedAt.toISOString(),
        row.endedAt?.toISOString(),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString(),
        row.id,
      );
    }

    throw new Error(
      `Corrupt step execution row ${row.id}: unknown step type '${row.type}'`,
    );
  }

  async load(id: number): Promise<TicketPipelineStepExecutionEntity | null> {
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

  async loadByTicketId(
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

    return rows.map((row) => this.mapRowToExecution(row));
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
      failureReason: null,
      rawResultJson: null,
      completedAt: null,
      lastPolledAt: null,
      duplicateCandidatesProposed: null,
      duplicateCandidatesDismissed: null,
      duplicateCandidatesPromoted: null,
    };
  }

  private async upsertStepExecution(
    tx: DbExecutor,
    pipeline: TicketPipelineStepExecutionEntity,
    startedAt: Date,
    endedAt: Date | null,
    now: Date,
    fields: Record<string, unknown>,
  ): Promise<TicketPipelineStepExecutionEntity> {
    const [saved] = await tx
      .insert(ticketStepExecutionsTph)
      .values({
        id: pipeline.id,
        ticketId: pipeline.ticketId,
        stepName: pipeline.stepName,
        type: pipeline.stepName,
        status: pipeline.status,
        idempotencyKey: pipeline.idempotencyKey,
        startedAt,
        endedAt,
        createdAt: pipeline.createdAt
          ? parseIsoDateOrThrow(pipeline.createdAt, "createdAt")
          : now,
        updatedAt: now,
        ...fields,
      })
      .onConflictDoUpdate({
        target: ticketStepExecutionsTph.idempotencyKey,
        set: {
          stepName: pipeline.stepName,
          type: pipeline.stepName,
          status: pipeline.status,
          startedAt,
          endedAt,
          updatedAt: now,
          ...fields,
        },
      })
      .returning({
        id: ticketStepExecutionsTph.id,
        createdAt: ticketStepExecutionsTph.createdAt,
        updatedAt: ticketStepExecutionsTph.updatedAt,
      });

    pipeline.id = saved.id;
    pipeline.createdAt = saved.createdAt.toISOString();
    pipeline.updatedAt = saved.updatedAt.toISOString();
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
        summaryOfFindings: pipeline.result.summaryOfEnrichment,
        confidenceLevel: pipeline.result.confidenceLevel,
        rawResultJson: {
          ...pipeline.result.rawResultJson,
          datadogQueryTerms: pipeline.result.datadogQueryTerms,
          datadogTimeRange: pipeline.result.datadogTimeRange,
          keyIdentifiers: pipeline.result.keyIdentifiers,
          enrichedTicketDescription: pipeline.result.enrichedTicketDescription,
          operationOutcome: pipeline.result.operationOutcome,
        },
        completedAt: endedAt,
        lastPolledAt: now,
      };
    }

    return this.upsertStepExecution(
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

    return this.upsertStepExecution(
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

    return this.upsertStepExecution(
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
    const fields = {
      ...this.buildDiscriminatorResetFields(),
      githubIssueNumber: reproResult?.githubIssueNumber ?? null,
      githubIssueId: reproResult?.githubIssueId ?? null,
      githubAgentRunId: reproResult?.githubAgentRunId ?? null,
      agentStatus: reproResult?.agentStatus ?? null,
      githubMergeStatus: reproResult?.githubMergeStatus ?? "draft",
      githubPrTargetBranch: reproResult?.githubPrTargetBranch ?? null,
      agentBranch: reproResult?.agentBranch ?? null,
      failingTestCommitSha: reproResult?.failingTestCommitSha ?? null,
      failureReason: reproResult?.failureReason ?? null,
      rawResultJson: reproResult?.rawResultJson ?? null,
      completedAt: endedAt,
      lastPolledAt: now,
      outcome: reproResult?.outcome ?? null,
      failingTestPath: serializeFailingTestPaths(reproResult?.failingTestPaths),
      summaryOfFindings: reproResult?.summaryOfFindings ?? null,
      confidenceLevel: reproResult?.confidenceLevel ?? null,
    };

    return this.upsertStepExecution(
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

    return this.upsertStepExecution(
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
  ): Promise<TicketPipelineStepExecutionEntity> {
    const db = getDb();

    const now = new Date();
    const startedAt = parseIsoDateOrThrow(pipeline.startedAt, "startedAt");
    const endedAt = pipeline.endedAt
      ? parseIsoDateOrThrow(pipeline.endedAt, "endedAt")
      : null;

    let savedExecution: TicketPipelineStepExecutionEntity;
    if (pipeline instanceof TicketDescriptionEnrichmentStepExecutionEntity) {
      savedExecution = await this.saveDescriptionEnrichmentExecution(
        db,
        pipeline,
        startedAt,
        endedAt,
        now,
      );
    } else if (
      pipeline instanceof TicketDescriptionQualityStepExecutionEntity
    ) {
      savedExecution = await this.saveDescriptionQualityExecution(
        db,
        pipeline,
        startedAt,
        endedAt,
        now,
      );
    } else if (pipeline instanceof TicketDuplicateCandidatesStepResultEntity) {
      savedExecution = await this.saveDuplicateCandidatesExecution(
        db,
        pipeline,
        startedAt,
        endedAt,
        now,
      );
    } else if (pipeline instanceof FailingTestReproStepExecutionEntity) {
      savedExecution = await this.saveFailingTestReproExecution(
        db,
        pipeline,
        startedAt,
        endedAt,
        now,
      );
    } else if (pipeline instanceof FailingTestFixStepExecutionEntity) {
      savedExecution = await this.saveFailingTestFixExecution(
        db,
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

    return savedExecution;
  }

  async loadByTicketIds(
    ticketIds: string[],
  ): Promise<Map<string, TicketPipelineStepExecutionEntity[]>> {
    if (ticketIds.length === 0) {
      return new Map();
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(ticketStepExecutionsTph)
      .where(inArray(ticketStepExecutionsTph.ticketId, ticketIds));

    const stepExecutionsByTicketId = new Map<
      string,
      TicketPipelineStepExecutionEntity[]
    >();

    for (const row of rows) {
      const execution = this.mapRowToExecution(row);

      const executions = stepExecutionsByTicketId.get(row.ticketId);
      if (executions) {
        executions.push(execution);
      } else {
        stepExecutionsByTicketId.set(row.ticketId, [execution]);
      }
    }

    return stepExecutionsByTicketId;
  }
}
