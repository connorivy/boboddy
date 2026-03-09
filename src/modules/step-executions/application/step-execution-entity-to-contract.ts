import {
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionQualityStepExecutionEntity,
  FailingTestFixStepExecutionEntity,
  FailingTestReproStepExecutionEntity,
  TicketDuplicateCandidatesStepResultEntity,
  TicketPipelineStepExecutionEntity,
} from "@/modules/step-executions/domain/step-execution-entity";
import {
  failingTestFixStepResultContractSchema,
  failingTestReproStepResultContractSchema,
  stepExecutionContractSchema,
  ticketDescriptionEnrichmentResultContractSchema,
  ticketDuplicateCandidatesStepResultContractSchema,
  ticketDescriptionQualityResultContractSchema,
  type StepExecutionContract,
} from "@/modules/step-executions/contracts/step-execution-contracts";

function mapDescriptionEnrichmentResult(
  stepExecution: TicketDescriptionEnrichmentStepExecutionEntity,
): ReturnType<typeof ticketDescriptionEnrichmentResultContractSchema.parse> {
  if (!stepExecution.result) {
    throw new Error(
      "Cannot map description enrichment result when execution has no result payload",
    );
  }
  const result = stepExecution.result;

  return ticketDescriptionEnrichmentResultContractSchema.parse({
    executionId: stepExecution.id,
    stepName: stepExecution.stepName,
    summaryOfEnrichment: result.summaryOfEnrichment,
    enrichedTicketDescription: result.enrichedTicketDescription,
    datadogQueryTerms: result.datadogQueryTerms,
    datadogTimeRange: result.datadogTimeRange,
    keyIdentifiers: result.keyIdentifiers,
    confidenceLevel: result.confidenceLevel,
    agentStatus: result.agentStatus,
    agentBranch: result.agentBranch,
    operationOutcome: result.operationOutcome,
    rawResultJson: result.rawResultJson,
    createdAt: stepExecution.createdAt,
    updatedAt: stepExecution.updatedAt,
  });
}

function mapDescriptionQualityResult(
  stepExecution: TicketDescriptionQualityStepExecutionEntity,
): ReturnType<typeof ticketDescriptionQualityResultContractSchema.parse> {
  if (!stepExecution.result) {
    throw new Error(
      "Cannot map description quality result when execution has no result payload",
    );
  }
  const result = stepExecution.result;

  return ticketDescriptionQualityResultContractSchema.parse({
    executionId: stepExecution.id,
    stepName: stepExecution.stepName,
    stepsToReproduceScore: result.stepsToReproduceScore,
    expectedBehaviorScore: result.expectedBehaviorScore,
    observedBehaviorScore: result.observedBehaviorScore,
    reasoning: result.reasoning,
    rawResponse: result.rawResponse,
    createdAt: stepExecution.createdAt,
    updatedAt: stepExecution.updatedAt,
  });
}

function mapDuplicateCandidatesResult(
  stepExecution: TicketDuplicateCandidatesStepResultEntity,
): ReturnType<typeof ticketDuplicateCandidatesStepResultContractSchema.parse> {
  if (!stepExecution.result) {
    throw new Error(
      "Cannot map duplicate candidates result when execution has no result payload",
    );
  }
  const result = stepExecution.result;

  return ticketDuplicateCandidatesStepResultContractSchema.parse({
    executionId: stepExecution.id,
    stepName: stepExecution.stepName,
    proposed: result.proposed.map((candidate) => ({
      candidateTicketId: candidate.candidateTicketId,
      score: candidate.score,
    })),
    dismissed: result.dismissed.map((candidate) => ({
      candidateTicketId: candidate.candidateTicketId,
      score: candidate.score,
    })),
    promoted: result.promoted.map((candidate) => ({
      candidateTicketId: candidate.candidateTicketId,
      score: candidate.score,
    })),
    createdAt: stepExecution.createdAt,
    updatedAt: stepExecution.updatedAt,
  });
}

function mapFailingTestReproResult(
  stepExecution: FailingTestReproStepExecutionEntity,
): ReturnType<typeof failingTestReproStepResultContractSchema.parse> {
  if (!stepExecution.result) {
    throw new Error(
      "Cannot map failing test repro result when execution has no result payload",
    );
  }

  const result = stepExecution.result;

  return failingTestReproStepResultContractSchema.parse({
    executionId: stepExecution.id,
    stepName: stepExecution.stepName,
    githubIssueNumber: result.githubIssueNumber ?? null,
    githubIssueId: result.githubIssueId ?? null,
    githubAgentRunId: result.githubAgentRunId ?? null,
    githubMergeStatus: result.githubMergeStatus,
    githubPrTargetBranch: result.githubPrTargetBranch ?? null,
    agentStatus: result.agentStatus ?? null,
    agentBranch: result.agentBranch ?? null,
    failingTestPaths: result.failingTestPaths ?? null,
    failingTestCommitSha: result.failingTestCommitSha ?? null,
    outcome: result.outcome ?? null,
    summaryOfFindings: result.summaryOfFindings ?? null,
    confidenceLevel: result.confidenceLevel ?? null,
    feedbackRequest: result.feedbackRequest ?? null,
    failureReason: result.failureReason ?? null,
    rawResultJson: result.rawResultJson ?? null,
    createdAt: stepExecution.createdAt,
    updatedAt: stepExecution.updatedAt,
  });
}

function mapFailingTestFixResult(
  stepExecution: FailingTestFixStepExecutionEntity,
): ReturnType<typeof failingTestFixStepResultContractSchema.parse> {
  if (!stepExecution.result) {
    throw new Error(
      "Cannot map failing test fix result when execution has no result payload",
    );
  }
  const result = stepExecution.result;
  const completionResult = result.completionResult;

  return failingTestFixStepResultContractSchema.parse({
    executionId: stepExecution.id,
    stepName: stepExecution.stepName,
    githubIssueNumber: result.githubIssueNumber,
    githubIssueId: result.githubIssueId,
    githubAgentRunId: result.githubAgentRunId ?? null,
    githubMergeStatus: result.githubMergeStatus,
    githubPrTargetBranch: result.githubPrTargetBranch,
    agentStatus: completionResult?.agentStatus ?? null,
    agentBranch: completionResult?.agentBranch ?? null,
    agentSummary: result.agentSummary ?? null,
    fixedTestPath:
      completionResult?.fixedTestPath ?? result.failingTestPath ?? null,
    failingTestCommitSha: result.failingTestCommitSha,
    fixOperationOutcome: completionResult?.fixOperationOutcome ?? null,
    summaryOfFix: completionResult?.summaryOfFix ?? null,
    fixConfidenceLevel: completionResult?.fixConfidenceLevel ?? null,
    failureReason: completionResult?.failureReason ?? null,
    rawResultJson: completionResult?.rawResultJson ?? null,
    createdAt: stepExecution.createdAt,
    updatedAt: stepExecution.updatedAt,
  });
}

export const stepExecutionEntityToContract = (
  stepExecution: TicketPipelineStepExecutionEntity,
): StepExecutionContract => {
  if (
    stepExecution.createdAt === undefined ||
    stepExecution.updatedAt === undefined
  ) {
    throw new Error(
      "Cannot map step execution to contract without persistence metadata",
    );
  }

  let mappedResult:
    | ReturnType<typeof ticketDescriptionEnrichmentResultContractSchema.parse>
    | ReturnType<typeof ticketDescriptionQualityResultContractSchema.parse>
    | ReturnType<typeof ticketDuplicateCandidatesStepResultContractSchema.parse>
    | ReturnType<typeof failingTestReproStepResultContractSchema.parse>
    | ReturnType<typeof failingTestFixStepResultContractSchema.parse>
    | null = null;

  if (
    stepExecution instanceof TicketDescriptionEnrichmentStepExecutionEntity &&
    stepExecution.result
  ) {
    mappedResult = mapDescriptionEnrichmentResult(stepExecution);
  }

  if (
    stepExecution instanceof TicketDescriptionQualityStepExecutionEntity &&
    stepExecution.result
  ) {
    mappedResult = mapDescriptionQualityResult(stepExecution);
  }

  if (
    stepExecution instanceof TicketDuplicateCandidatesStepResultEntity &&
    stepExecution.result
  ) {
    mappedResult = mapDuplicateCandidatesResult(stepExecution);
  }

  if (
    stepExecution instanceof FailingTestReproStepExecutionEntity &&
    stepExecution.result
  ) {
    mappedResult = mapFailingTestReproResult(stepExecution);
  }

  if (
    stepExecution instanceof FailingTestFixStepExecutionEntity &&
    stepExecution.result
  ) {
    mappedResult = mapFailingTestFixResult(stepExecution);
  }

  return stepExecutionContractSchema.parse({
    id: stepExecution.id,
    pipelineId: stepExecution.pipelineId ?? stepExecution.ticketId,
    stepName: stepExecution.stepName,
    status: stepExecution.status,
    startedAt: stepExecution.startedAt,
    endedAt: stepExecution.endedAt ?? null,
    createdAt: stepExecution.createdAt,
    updatedAt: stepExecution.updatedAt,
    failureReason: stepExecution.failureReason ?? null,
    result: mappedResult,
  });
};
