import { v7 as uuidv7 } from "uuid";
import type { DomainEvent } from "@/lib/domain-events/domain-event";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  StepExecutionStatus,
  TERMINAL_STEP_EXECUTION_STATUSES,
  TICKET_INVESTIGATION_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { StepExecutionCompletedDomainEvent } from "@/modules/step-executions/domain/step-execution-completed.domain-event";
import type {
  TicketDescriptionEnrichmentCodeUnit,
  TicketDescriptionEnrichmentDatabaseFinding,
  TicketDescriptionEnrichmentDatadogSessionFinding,
  TicketDescriptionEnrichmentLogFinding,
} from "@/modules/step-executions/ticket_description_enrichment/shared/ticket-description-enrichment-result";

const assertNormalizedScore = (value: number, fieldName: string): number => {
  if (value < 0 || value > 1) {
    throw new Error(`${fieldName} must be between 0 and 1`);
  }

  return value;
};

const normalizeDate = (value: Date | string | undefined): Date | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return parsed;
};

export type FailingTestReproFeedbackRequestEntity = {
  requestId: string;
  reason: string;
  questions: string[];
  assumptions: string[];
};

type SetStepExecutionResultInput<TResult> = {
  status: StepExecutionStatus;
  endedAt?: Date | string;
  failureReason?: string;
  result?: TResult | null;
};

export abstract class TicketPipelineStepExecutionEntity<TResult = unknown> {
  public id: string;
  private readonly domainEvents: DomainEvent[] = [];

  constructor(
    pipelineId: string | null | undefined,
    public ticketId: string,
    public stepName: string,
    public status: StepExecutionStatus,
    public result: TResult | null,
    startedAt: Date | string,
    endedAt?: Date | string,
    id?: string,
    createdAt?: Date | string,
    updatedAt?: Date | string,
    public failureReason?: string,
  ) {
    this.pipelineId = pipelineId ?? null;
    this.id = id ?? uuidv7();
    this.startedAt = normalizeDate(startedAt) as Date;
    this.endedAt = normalizeDate(endedAt);
    this.createdAt = normalizeDate(createdAt);
    this.updatedAt = normalizeDate(updatedAt);
  }

  public pipelineId: string | null;
  public startedAt: Date;
  public endedAt?: Date;
  public createdAt?: Date;
  public updatedAt?: Date;

  pullDomainEvents(): DomainEvent[] {
    const events = [...this.domainEvents];
    this.domainEvents.length = 0;
    return events;
  }

  setResult({
    status,
    endedAt,
    failureReason,
    result,
  }: SetStepExecutionResultInput<TResult>): void {
    this.status = status;
    this.endedAt = normalizeDate(endedAt);
    if (failureReason !== undefined) {
      this.failureReason = failureReason;
    }
    if (result !== undefined) {
      this.result = result;
    }
    if (this.endedAt && TERMINAL_STEP_EXECUTION_STATUSES.has(this.status)) {
      this.addDomainEvent(
        new StepExecutionCompletedDomainEvent({
          stepExecutionId: this.id,
          pipelineId: this.pipelineId,
          ticketId: this.ticketId,
          stepName: this.stepName,
          status: this.status,
          startedAt: this.startedAt,
          endedAt: this.endedAt,
        }),
      );
    }
  }

  updateStatus(newStatus: StepExecutionStatus): void {
    this.status = newStatus;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this.domainEvents.push(event);
  }
}

export class TicketDescriptionQualityStepResultEntity {
  constructor(
    public stepsToReproduceScore: number,
    public expectedBehaviorScore: number,
    public observedBehaviorScore: number,
    public reasoning: string,
    public rawResponse: string,
  ) {
    this.stepsToReproduceScore = assertNormalizedScore(
      stepsToReproduceScore,
      "stepsToReproduceScore",
    );
    this.expectedBehaviorScore = assertNormalizedScore(
      expectedBehaviorScore,
      "expectedBehaviorScore",
    );
    this.observedBehaviorScore = assertNormalizedScore(
      observedBehaviorScore,
      "observedBehaviorScore",
    );
  }
}

export class TicketDescriptionEnrichmentStepResultEntity {
  constructor(
    public summaryOfInvestigation: string,
    public investigationReport: string,
    public whatHappened: string,
    public datadogQueryTerms: string[],
    public datadogTimeRange: string | null,
    public keyIdentifiers: string[],
    public exactEventTimes: string[],
    public codeUnitsInvolved: TicketDescriptionEnrichmentCodeUnit[],
    public databaseFindings: TicketDescriptionEnrichmentDatabaseFinding[],
    public logFindings: TicketDescriptionEnrichmentLogFinding[],
    public datadogSessionFindings: TicketDescriptionEnrichmentDatadogSessionFinding[],
    public investigationGaps: string[],
    public recommendedNextQueries: string[],
    public confidenceLevel: number | null,
    public rawResultJson: Record<string, unknown>,
    public agentStatus:
      | "complete"
      | "error"
      | "abort"
      | "timeout"
      | "user_exit",
    public agentBranch: string,
    public operationOutcome:
      | "findings_recorded"
      | "inconclusive"
      | "agent_error"
      | "cancelled",
  ) {}
}

export class TicketDescriptionEnrichmentStepExecutionEntity extends TicketPipelineStepExecutionEntity<TicketDescriptionEnrichmentStepResultEntity> {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    result: TicketDescriptionEnrichmentStepResultEntity | null,
    startedAt: Date | string,
    endedAt?: Date | string,
    createdAt?: Date | string,
    updatedAt?: Date | string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      TICKET_INVESTIGATION_STEP_NAME,
      status,
      result,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      failureReason,
    );
  }
}

export class TicketDescriptionQualityStepExecutionEntity extends TicketPipelineStepExecutionEntity<TicketDescriptionQualityStepResultEntity> {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    result: TicketDescriptionQualityStepResultEntity | null,
    startedAt: Date | string,
    endedAt?: Date | string,
    createdAt?: Date | string,
    updatedAt?: Date | string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      TICKET_DESCRIPTION_QUALITY_STEP_NAME,
      status,
      result,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      failureReason,
    );
  }
}

export class TicketDuplicateCandidateResultItemEntity {
  constructor(
    public candidateTicketId: string,
    public score: number,
  ) {}
}

export class TicketDuplicateCandidatesResultEntity {
  constructor(
    public proposed: TicketDuplicateCandidateResultItemEntity[],
    public dismissed: TicketDuplicateCandidateResultItemEntity[],
    public promoted: TicketDuplicateCandidateResultItemEntity[],
  ) {}
}

export class TicketDuplicateCandidatesStepResultEntity extends TicketPipelineStepExecutionEntity<TicketDuplicateCandidatesResultEntity> {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    result: TicketDuplicateCandidatesResultEntity | null,
    startedAt: Date | string,
    endedAt?: Date | string,
    createdAt?: Date | string,
    updatedAt?: Date | string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
      status,
      result,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      failureReason,
    );
  }
}

export type FailingTestReproAgentStatus =
  | "complete"
  | "error"
  | "abort"
  | "timeout"
  | "user_exit";

export type FailingTestReproOutcome =
  | "reproduced"
  | "not_reproducible"
  | "needs_user_feedback"
  | "agent_error"
  | "cancelled";

abstract class FailingTestReproStepResultBaseEntity {
  constructor(
    public githubMergeStatus: "draft" | "open" | "closed" | "merged",
    public githubIssueNumber: number,
    public githubIssueId: string,
    public agentStatus: FailingTestReproAgentStatus,
    public agentBranch: string,
    public outcome: FailingTestReproOutcome,
    public summaryOfFindings: string,
    public githubAgentRunId?: string,
    public failingTestCommitSha?: string,
    public rawResultJson?: Record<string, unknown>,
  ) {}
}

export class FailingTestReproSucceededResultEntity extends FailingTestReproStepResultBaseEntity {
  public readonly outcome: "reproduced";

  constructor(
    githubMergeStatus: "draft" | "open" | "closed" | "merged",
    githubIssueNumber: number,
    githubIssueId: string,
    agentStatus: FailingTestReproAgentStatus,
    agentBranch: string,
    public summaryOfFindings: string,
    public confidenceLevel: number,
    public failingTestPaths: string[],
    githubAgentRunId?: string,
    failingTestCommitSha?: string,
    rawResultJson?: Record<string, unknown>,
  ) {
    super(
      githubMergeStatus,
      githubIssueNumber,
      githubIssueId,
      agentStatus,
      agentBranch,
      "reproduced",
      summaryOfFindings,
      githubAgentRunId,
      failingTestCommitSha,
      rawResultJson,
    );
    this.outcome = "reproduced";
  }
}

export class FailingTestReproNotReproducibleResultEntity extends FailingTestReproStepResultBaseEntity {
  public readonly outcome: "not_reproducible";

  constructor(
    githubMergeStatus: "draft" | "open" | "closed" | "merged",
    githubIssueNumber: number,
    githubIssueId: string,
    agentStatus: FailingTestReproAgentStatus,
    agentBranch: string,
    public summaryOfFindings: string,
    public confidenceLevel: number,
    githubAgentRunId?: string,
    failingTestCommitSha?: string,
    rawResultJson?: Record<string, unknown>,
  ) {
    super(
      githubMergeStatus,
      githubIssueNumber,
      githubIssueId,
      agentStatus,
      agentBranch,
      "not_reproducible",
      summaryOfFindings,
      githubAgentRunId,
      failingTestCommitSha,
      rawResultJson,
    );
    this.outcome = "not_reproducible";
  }
}

export class FailingTestReproNeedsUserFeedbackResultEntity extends FailingTestReproStepResultBaseEntity {
  public readonly outcome: "needs_user_feedback";

  constructor(
    githubMergeStatus: "draft" | "open" | "closed" | "merged",
    githubIssueNumber: number,
    githubIssueId: string,
    agentStatus: FailingTestReproAgentStatus,
    agentBranch: string,
    public summaryOfFindings: string,
    public feedbackRequest: FailingTestReproFeedbackRequestEntity,
    githubAgentRunId?: string,
    failingTestCommitSha?: string,
    rawResultJson?: Record<string, unknown>,
  ) {
    super(
      githubMergeStatus,
      githubIssueNumber,
      githubIssueId,
      agentStatus,
      agentBranch,
      "needs_user_feedback",
      summaryOfFindings,
      githubAgentRunId,
      failingTestCommitSha,
      rawResultJson,
    );
    this.outcome = "needs_user_feedback";
  }
}

export class FailingTestReproAgentErrorResultEntity extends FailingTestReproStepResultBaseEntity {
  public readonly outcome: "agent_error";

  constructor(
    githubMergeStatus: "draft" | "open" | "closed" | "merged",
    githubIssueNumber: number,
    githubIssueId: string,
    agentStatus: FailingTestReproAgentStatus,
    agentBranch: string,
    public summaryOfFindings: string,
    public failureReason: string,
    githubAgentRunId?: string,
    failingTestCommitSha?: string,
    rawResultJson?: Record<string, unknown>,
  ) {
    super(
      githubMergeStatus,
      githubIssueNumber,
      githubIssueId,
      agentStatus,
      agentBranch,
      "agent_error",
      summaryOfFindings,
      githubAgentRunId,
      failingTestCommitSha,
      rawResultJson,
    );
    this.outcome = "agent_error";
  }
}

export class FailingTestReproCancelledResultEntity extends FailingTestReproStepResultBaseEntity {
  public readonly outcome: "cancelled";

  constructor(
    githubMergeStatus: "draft" | "open" | "closed" | "merged",
    githubIssueNumber: number,
    githubIssueId: string,
    agentStatus: FailingTestReproAgentStatus,
    agentBranch: string,
    public summaryOfFindings: string,
    public failureReason?: string,
    githubAgentRunId?: string,
    failingTestCommitSha?: string,
    rawResultJson?: Record<string, unknown>,
  ) {
    super(
      githubMergeStatus,
      githubIssueNumber,
      githubIssueId,
      agentStatus,
      agentBranch,
      "cancelled",
      summaryOfFindings,
      githubAgentRunId,
      failingTestCommitSha,
      rawResultJson,
    );
    this.outcome = "cancelled";
  }
}

export type FailingTestReproStepResultEntity =
  | FailingTestReproSucceededResultEntity
  | FailingTestReproNotReproducibleResultEntity
  | FailingTestReproNeedsUserFeedbackResultEntity
  | FailingTestReproAgentErrorResultEntity
  | FailingTestReproCancelledResultEntity;

export class FailingTestReproStepExecutionEntity extends TicketPipelineStepExecutionEntity<FailingTestReproStepResultEntity> {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    result: FailingTestReproStepResultEntity | null,
    public githubPrTargetBranch: string | null,
    startedAt: Date | string,
    endedAt?: Date | string,
    createdAt?: Date | string,
    updatedAt?: Date | string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      FAILING_TEST_REPRO_STEP_NAME,
      status,
      result,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      failureReason,
    );
  }

  override setResult({
    status,
    endedAt,
    failureReason,
    result,
    githubPrTargetBranch,
  }: SetStepExecutionResultInput<FailingTestReproStepResultEntity> & {
    githubPrTargetBranch?: string | null;
  }): void {
    super.setResult({ status, endedAt, failureReason, result });
    this.githubPrTargetBranch = githubPrTargetBranch ?? null;
  }

  override updateStatus(
    newStatus: StepExecutionStatus,
    githubPrTargetBranch?: string | null,
  ): void {
    if (githubPrTargetBranch !== undefined) {
      this.githubPrTargetBranch = githubPrTargetBranch;
    }

    super.updateStatus(newStatus);
  }
}

export class FailingTestFixStepResultEntity {
  constructor(
    public githubMergeStatus: "draft" | "open" | "closed" | "merged",
    public githubIssueNumber: number,
    public githubIssueId: string,
    public githubPrTargetBranch: string,
    public completionResult: FailingTestFixStepCompletionResultEntity | null,
    public githubAgentRunId?: string,
    public agentSummary?: string,
    public failingTestPath?: string,
    public failingTestCommitSha?: string,
  ) {}
}

export class FailingTestFixStepCompletionResultEntity {
  constructor(
    public agentStatus:
      | "complete"
      | "error"
      | "abort"
      | "timeout"
      | "user_exit",
    public agentBranch: string,
    public fixOperationOutcome:
      | "fixed"
      | "not_fixed"
      | "agent_error"
      | "cancelled",
    public summaryOfFix: string,
    public fixConfidenceLevel: number,
    public fixedTestPath?: string,
    public failureReason?: string,
    public rawResultJson?: Record<string, unknown>,
  ) {}
}

export class FailingTestFixStepExecutionEntity extends TicketPipelineStepExecutionEntity<FailingTestFixStepResultEntity> {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    result: FailingTestFixStepResultEntity | null,
    startedAt: Date | string,
    endedAt?: Date | string,
    createdAt?: Date | string,
    updatedAt?: Date | string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      FAILING_TEST_FIX_STEP_NAME,
      status,
      result,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      failureReason,
    );
  }
}

export class FinalizeFailingTestReproPrStepResultEntity {
  constructor(
    public githubMergeStatus: "draft" | "open" | "closed" | "merged",
    public githubIssueNumber: number,
    public githubIssueId: string,
    public githubPrTargetBranch: string,
    public agentBranch: string,
  ) {}
}

export class FinalizeFailingTestReproPrStepExecutionEntity extends TicketPipelineStepExecutionEntity<FinalizeFailingTestReproPrStepResultEntity> {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    result: FinalizeFailingTestReproPrStepResultEntity | null,
    startedAt: Date | string,
    endedAt?: Date | string,
    createdAt?: Date | string,
    updatedAt?: Date | string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      FINALIZE_FAILING_TEST_REPRO_PR_STEP_NAME,
      status,
      result,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      failureReason,
    );
  }
}
