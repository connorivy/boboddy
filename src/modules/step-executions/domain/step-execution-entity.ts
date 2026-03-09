import { v7 as uuidv7 } from "uuid";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  StepExecutionStatus,
  TICKET_INVESTIGATION_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
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

export type FailingTestReproFeedbackRequestEntity = {
  requestId: string;
  reason: string;
  questions: string[];
  assumptions: string[];
};

export abstract class TicketPipelineStepExecutionEntity {
  public id: string;

  constructor(
    pipelineId: string | null | undefined,
    public ticketId: string,
    public stepName: string,
    public status: StepExecutionStatus,
    public startedAt: string,
    public endedAt?: string,
    id?: string,
    public createdAt?: string,
    public updatedAt?: string,
    public failureReason?: string,
  ) {
    this.pipelineId = pipelineId ?? null;
    this.id = id ?? uuidv7();
  }

  public pipelineId: string | null;
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

export class TicketDescriptionEnrichmentStepExecutionEntity extends TicketPipelineStepExecutionEntity {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    public result: TicketDescriptionEnrichmentStepResultEntity | null,
    startedAt: string,
    endedAt?: string,
    createdAt?: string,
    updatedAt?: string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      TICKET_INVESTIGATION_STEP_NAME,
      status,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      failureReason,
    );
  }
}

export class TicketDescriptionQualityStepExecutionEntity extends TicketPipelineStepExecutionEntity {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    public result: TicketDescriptionQualityStepResultEntity | null,
    startedAt: string,
    endedAt?: string,
    createdAt?: string,
    updatedAt?: string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      TICKET_DESCRIPTION_QUALITY_STEP_NAME,
      status,
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

export class TicketDuplicateCandidatesStepResultEntity extends TicketPipelineStepExecutionEntity {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    public result: TicketDuplicateCandidatesResultEntity | null,
    startedAt: string,
    endedAt?: string,
    createdAt?: string,
    updatedAt?: string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
      status,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      failureReason,
    );
  }
}

export class FailingTestReproStepResultEntity {
  constructor(
    public githubMergeStatus: "draft" | "open" | "closed" | "merged",
    public githubIssueNumber: number,
    public githubIssueId: string,
    public agentStatus:
      | "complete"
      | "error"
      | "abort"
      | "timeout"
      | "user_exit",
    public githubPrTargetBranch: string,
    public agentBranch: string,
    public outcome:
      | "reproduced"
      | "not_reproducible"
      | "needs_user_feedback"
      | "agent_error"
      | "cancelled",
    public summaryOfFindings: string,
    public confidenceLevel: number | null,
    public githubAgentRunId?: string,
    public failingTestPaths?: string[],
    public failingTestCommitSha?: string,
    public failureReason?: string,
    public rawResultJson?: Record<string, unknown>,
    public feedbackRequest?: FailingTestReproFeedbackRequestEntity,
  ) {}
}

export class FailingTestReproStepExecutionEntity extends TicketPipelineStepExecutionEntity {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    public result: FailingTestReproStepResultEntity | null,
    startedAt: string,
    endedAt?: string,
    createdAt?: string,
    updatedAt?: string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      FAILING_TEST_REPRO_STEP_NAME,
      status,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      failureReason,
    );
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

export class FailingTestFixStepExecutionEntity extends TicketPipelineStepExecutionEntity {
  constructor(
    pipelineId: string | null | undefined,
    ticketId: string,
    status: StepExecutionStatus,
    public result: FailingTestFixStepResultEntity | null,
    startedAt: string,
    endedAt?: string,
    createdAt?: string,
    updatedAt?: string,
    id?: string,
    failureReason?: string,
  ) {
    super(
      pipelineId,
      ticketId,
      FAILING_TEST_FIX_STEP_NAME,
      status,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      failureReason,
    );
  }
}
