import { z } from "zod";
import {
  FAILING_TEST_FIX_STEP_NAME,
  FAILING_TEST_REPRO_STEP_NAME,
  TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME,
  TICKET_DESCRIPTION_QUALITY_STEP_NAME,
  TICKET_DUPLICATE_CANDIDATES_STEP_NAME,
} from "@/modules/step-executions/domain/step-execution.types";

export const ticketDescriptionQualityResultContractSchema = z.object({
  executionId: z.number().int().positive(),
  stepName: z.literal(TICKET_DESCRIPTION_QUALITY_STEP_NAME),
  stepsToReproduceScore: z.number().int().min(1).max(5),
  expectedBehaviorScore: z.number().int().min(1).max(5),
  observedBehaviorScore: z.number().int().min(1).max(5),
  reasoning: z.string().min(1),
  rawResponse: z.string().min(1),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});

export const ticketDescriptionEnrichmentResultContractSchema = z.object({
  executionId: z.number().int().positive(),
  stepName: z.literal(TICKET_DESCRIPTION_ENRICHMENT_STEP_NAME),
  summaryOfEnrichment: z.string().min(1),
  enrichedTicketDescription: z.string().min(1),
  datadogQueryTerms: z.array(z.string().min(1)),
  datadogTimeRange: z.string().nullable(),
  keyIdentifiers: z.array(z.string().min(1)),
  confidenceLevel: z.number().min(0).max(1).nullable(),
  agentStatus: z.enum(["complete", "error", "abort", "timeout", "user_exit"]),
  agentBranch: z.string().min(1),
  operationOutcome: z.enum([
    "enriched",
    "insufficient_evidence",
    "agent_error",
    "cancelled",
  ]),
  rawResultJson: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});

export const duplicateCandidateResultContractSchema = z.object({
  candidateTicketId: z.string().min(1),
  score: z.number().min(0).max(1),
  status: z.enum(["proposed", "dismissed", "promoted"]),
});

export const ticketDuplicateCandidatesStepResultContractSchema = z.object({
  executionId: z.number().int().positive(),
  stepName: z.literal(TICKET_DUPLICATE_CANDIDATES_STEP_NAME),
  candidates: z.array(duplicateCandidateResultContractSchema),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});

export const failingTestReproStepResultContractSchema = z.object({
  executionId: z.number().int().positive(),
  stepName: z.literal(FAILING_TEST_REPRO_STEP_NAME),
  githubIssueNumber: z.number().int().nullable(),
  githubIssueId: z.string().nullable(),
  githubAgentRunId: z.string().nullable(),
  githubMergeStatus: z.enum(["draft", "open", "closed", "merged"]),
  githubPrTargetBranch: z.string().nullable(),
  agentStatus: z
    .enum(["complete", "error", "abort", "timeout", "user_exit"])
    .nullable(),
  agentBranch: z.string().nullable(),
  failingTestPaths: z.array(z.string()).nullable(),
  failingTestCommitSha: z.string().nullable(),
  outcome: z
    .enum([
      "reproduced",
      "not_reproducible",
      "needs_user_feedback",
      "agent_error",
      "cancelled",
    ])
    .nullable(),
  summaryOfFindings: z.string().nullable(),
  confidenceLevel: z.number().min(0).max(1).nullable(),
  feedbackRequest: z
    .object({
      requestId: z.string().min(1),
      reason: z.string().min(1),
      questions: z.array(z.string().min(1)),
      assumptions: z.array(z.string().min(1)),
    })
    .nullable(),
  failureReason: z.string().nullable(),
  rawResultJson: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});

export const failingTestFixStepResultContractSchema = z.object({
  executionId: z.number().int().positive(),
  stepName: z.literal(FAILING_TEST_FIX_STEP_NAME),
  githubIssueNumber: z.number().int().nullable(),
  githubIssueId: z.string().nullable(),
  githubAgentRunId: z.string().nullable(),
  githubMergeStatus: z.enum(["draft", "open", "closed", "merged"]),
  githubPrTargetBranch: z.string().nullable(),
  agentStatus: z
    .enum(["complete", "error", "abort", "timeout", "user_exit"])
    .nullable(),
  agentBranch: z.string().nullable(),
  agentSummary: z.string().nullable(),
  fixedTestPath: z.string().nullable(),
  failingTestCommitSha: z.string().nullable(),
  fixOperationOutcome: z
    .enum(["fixed", "not_fixed", "agent_error", "cancelled"])
    .nullable(),
  summaryOfFix: z.string().nullable(),
  fixConfidenceLevel: z.number().min(0).max(1).nullable(),
  failureReason: z.string().nullable(),
  rawResultJson: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});

export const stepExecutionResultContractSchema = z.union([
  ticketDescriptionEnrichmentResultContractSchema,
  ticketDescriptionQualityResultContractSchema,
  ticketDuplicateCandidatesStepResultContractSchema,
  failingTestReproStepResultContractSchema,
  failingTestFixStepResultContractSchema,
]);

export const stepExecutionStatusEnumSchema = z.enum([
  "not_started",
  "queued",
  "running",
  "waiting_for_user_feedback",
  "succeeded",
  "failed",
  "skipped",
  "failed_timeout",
]);

export const stepExecutionContractSchema = z.object({
  id: z.number().int().positive(),
  ticketId: z.string().min(1),
  pipelineRunId: z.number().int().positive(),
  stepName: z.string().min(1),
  status: stepExecutionStatusEnumSchema,
  idempotencyKey: z.string().min(1),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  result: stepExecutionResultContractSchema.nullable(),
});

export type StepExecutionStatus = z.infer<typeof stepExecutionStatusEnumSchema>;

export type TicketDescriptionQualityResultContract = z.infer<
  typeof ticketDescriptionQualityResultContractSchema
>;
export type TicketDescriptionEnrichmentResultContract = z.infer<
  typeof ticketDescriptionEnrichmentResultContractSchema
>;

export type DuplicateCandidateResultContract = z.infer<
  typeof duplicateCandidateResultContractSchema
>;

export type TicketDuplicateCandidatesStepResultContract = z.infer<
  typeof ticketDuplicateCandidatesStepResultContractSchema
>;

export type FailingTestReproStepResultContract = z.infer<
  typeof failingTestReproStepResultContractSchema
>;

export type FailingTestFixStepResultContract = z.infer<
  typeof failingTestFixStepResultContractSchema
>;

export type StepExecutionContract = z.infer<typeof stepExecutionContractSchema>;
