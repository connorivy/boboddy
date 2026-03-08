import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  StepExecutionStatus,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";
import { DuplicateCandidateResultItem } from "../infra/step-execution-repo";

export type FailingTestReproFeedbackRequestEntity = {
  requestId: string;
  reason: string;
  questions: string[];
  assumptions: string[];
};

export class TicketPipelineStepExecutionEntity {
  constructor(
    public ticketId: string,
    public stepName: string,
    public status: StepExecutionStatus,
    public idempotencyKey: string,
    public startedAt: string,
    public endedAt: string | undefined,
    public id: number | undefined,
    public createdAt: string | undefined,
    public updatedAt: string | undefined,
    public pipelineRunId: number,
  ) {}
}

export class TicketDescriptionQualityStepResultEntity {
  constructor(
    public stepsToReproduceScore: number,
    public expectedBehaviorScore: number,
    public observedBehaviorScore: number,
    public reasoning: string,
    public rawResponse: string,
  ) {}
}

export class TicketDescriptionEnrichmentStepResultEntity {
  constructor(
    public summaryOfEnrichment: string,
    public enrichedTicketDescription: string,
    public datadogQueryTerms: string[],
    public datadogTimeRange: string | null,
    public keyIdentifiers: string[],
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
      | "enriched"
      | "insufficient_evidence"
      | "agent_error"
      | "cancelled",
  ) {}
}

export class TicketDescriptionEnrichmentStepExecutionEntity extends TicketPipelineStepExecutionEntity {
  constructor(
    ticketId: string,
    status: StepExecutionStatus,
    idempotencyKey: string,
    public result: TicketDescriptionEnrichmentStepResultEntity | null,
    startedAt: string,
    endedAt: string | undefined,
    createdAt: string | undefined,
    updatedAt: string | undefined,
    id: number | undefined,
    pipelineRunId: number,
  ) {
    super(
      ticketId,
      TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
      status,
      idempotencyKey,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      pipelineRunId,
    );
  }
}

export class TicketDescriptionQualityStepExecutionEntity extends TicketPipelineStepExecutionEntity {
  constructor(
    ticketId: string,
    status: StepExecutionStatus,
    idempotencyKey: string,
    public result: TicketDescriptionQualityStepResultEntity | null,
    startedAt: string,
    endedAt: string | undefined,
    createdAt: string | undefined,
    updatedAt: string | undefined,
    id: number | undefined,
    pipelineRunId: number,
  ) {
    super(
      ticketId,
      TICKET_DESCRIPTION_QUALITY_STEP_NAME,
      status,
      idempotencyKey,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      pipelineRunId,
    );
  }
}

export class TicketDuplicateCandidatesStepResultEntity extends TicketPipelineStepExecutionEntity {
  constructor(
    ticketId: string,
    status: StepExecutionStatus,
    idempotencyKey: string,
    public candidates: DuplicateCandidateResultItem[],
    startedAt: string,
    endedAt: string | undefined,
    createdAt: string | undefined,
    updatedAt: string | undefined,
    id: number | undefined,
    pipelineRunId: number,
  ) {
    super(
      ticketId,
      TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
      status,
      idempotencyKey,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      pipelineRunId,
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
    ticketId: string,
    status: StepExecutionStatus,
    idempotencyKey: string,
    public result: FailingTestReproStepResultEntity | null,
    startedAt: string,
    endedAt: string | undefined,
    createdAt: string | undefined,
    updatedAt: string | undefined,
    id: number | undefined,
    pipelineRunId: number,
  ) {
    super(
      ticketId,
      FAILING_TEST_REPRO_STEP_NAME,
      status,
      idempotencyKey,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      pipelineRunId,
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
    ticketId: string,
    status: StepExecutionStatus,
    idempotencyKey: string,
    public result: FailingTestFixStepResultEntity | null,
    startedAt: string,
    endedAt: string | undefined,
    createdAt: string | undefined,
    updatedAt: string | undefined,
    id: number | undefined,
    pipelineRunId: number,
  ) {
    super(
      ticketId,
      FAILING_TEST_FIX_STEP_NAME,
      status,
      idempotencyKey,
      startedAt,
      endedAt,
      id,
      createdAt,
      updatedAt,
      pipelineRunId,
    );
  }
}
