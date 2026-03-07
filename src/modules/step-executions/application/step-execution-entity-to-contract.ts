import {
  TicketDescriptionEnrichmentStepExecutionEntity,
  TicketDescriptionQualityStepExecutionEntity,
  FailingTestFixStepExecutionEntity,
  FailingTestFixStepResultEntity,
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

const mapDescriptionEnrichmentResult = (
  stepExecution: TicketDescriptionEnrichmentStepExecutionEntity,
): ReturnType<typeof ticketDescriptionEnrichmentResultContractSchema.parse> =>
  (() => {
    if (stepExecution.id === undefined) {
      throw new Error(
        "Cannot map description enrichment result without execution ID",
      );
    }
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
  })();

const mapDescriptionQualityResult = (
  stepExecution: TicketDescriptionQualityStepExecutionEntity,
): ReturnType<typeof ticketDescriptionQualityResultContractSchema.parse> =>
  (() => {
    if (stepExecution.id === undefined) {
      throw new Error(
        "Cannot map description quality result without execution ID",
      );
    }
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
  })();

const mapDuplicateCandidatesResult = (
  result: TicketDuplicateCandidatesStepResultEntity,
): ReturnType<typeof ticketDuplicateCandidatesStepResultContractSchema.parse> =>
  (() => {
    if (result.id === undefined) {
      throw new Error(
        "Cannot map duplicate candidates result without execution ID",
      );
    }

    return ticketDuplicateCandidatesStepResultContractSchema.parse({
      executionId: result.id,
      stepName: result.stepName,
      candidates: result.candidates.map((candidate) => ({
        candidateTicketId: candidate.candidateTicketId,
        score: candidate.score,
        status: candidate.status,
      })),
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    });
  })();

const mapFailingTestReproResult = (
  stepExecution: FailingTestReproStepExecutionEntity,
): ReturnType<typeof failingTestReproStepResultContractSchema.parse> =>
  (() => {
    if (stepExecution.id === undefined) {
      throw new Error(
        "Cannot map failing test repro result without execution ID",
      );
    }

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
  })();

const mapFailingTestFixResult = (
  stepExecution: FailingTestFixStepExecutionEntity,
): ReturnType<typeof failingTestFixStepResultContractSchema.parse> =>
  (() => {
    if (stepExecution.id === undefined) {
      throw new Error("Cannot map failing test fix result without execution ID");
    }
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
  })();

export const stepExecutionEntityToContract = (
  stepExecution: TicketPipelineStepExecutionEntity,
): StepExecutionContract => {
  if (
    stepExecution.id === undefined ||
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

  if (stepExecution instanceof TicketDuplicateCandidatesStepResultEntity) {
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
    ticketId: stepExecution.ticketId,
    stepName: stepExecution.stepName,
    status: stepExecution.status,
    idempotencyKey: stepExecution.idempotencyKey,
    startedAt: stepExecution.startedAt,
    endedAt: stepExecution.endedAt ?? null,
    createdAt: stepExecution.createdAt,
    updatedAt: stepExecution.updatedAt,
    result: mappedResult,
  });
};
